import type { AnalysisRule, Severity } from '@/lib/llm/types';
import { freeModelOrder, getServiceClaudeConfig } from '@/lib/llm/types';
import { callOpenAICompatible, callAnthropicCompatible, parseFindingsJson } from '@/lib/llm/client';
import {
  LAUDO_SYSTEM_PROMPT,
  buildLaudoBatchPrompt,
  LAUDO_FUSION_SYSTEM_PROMPT,
  buildFusionPrompt,
  parseFusionJson,
  type LaudoFileInput,
  type FusionFinding,
} from './prompt';

export interface LaudoFindingResult {
  filePath: string;
  line: number | null;
  severity: Severity;
  title: string;
  message: string;
  suggestion: string | null;
  confirmedByBoth: boolean;
}

export interface RepositoryAnalysisResult {
  summary: string;
  findings: LaudoFindingResult[];
  freeModel: string | null;
  claudeModel: string | null;
  usedClaudeOnly: boolean;
}

const OPENROUTER_HEADERS = {
  'HTTP-Referer': process.env.AUTH_URL ?? 'https://codereview.app',
  'X-Title': 'AI Code Review - Laudo',
};

interface FreeStageResult {
  summary: string;
  findings: ReturnType<typeof parseFindingsJson>['findings'];
  model: string;
}

/** Tenta os modelos gratuitos do OpenRouter em ordem até um responder. Retorna null se nenhum estiver disponível. */
async function runFreeStage(
  batch: LaudoFileInput[],
  rules: AnalysisRule[],
  preferredModel?: string | null
): Promise<FreeStageResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const userPrompt = buildLaudoBatchPrompt(batch, rules);
  for (const model of freeModelOrder(preferredModel)) {
    try {
      const raw = await callOpenAICompatible(
        { apiKey, baseURL: 'https://openrouter.ai/api/v1', model, headers: OPENROUTER_HEADERS },
        LAUDO_SYSTEM_PROMPT,
        userPrompt
      );
      const parsed = parseFindingsJson(raw);
      return { ...parsed, model };
    } catch (error) {
      console.error(`[laudo] etapa gratuita "${model}" falhou, tentando próxima:`, error);
      continue;
    }
  }
  return null;
}

/**
 * Analisa um único lote de arquivos em duas etapas: (1) IA gratuita
 * (OpenRouter free, com failover entre modelos), (2) dupla checagem
 * obrigatória via Claude em modo fusão. Se a etapa 1 falhar por completo,
 * cai direto para o Claude sozinho (sem fusão, pois não há o que fundir) —
 * todos os apontamentos ficam marcados como não confirmados por ambas.
 */
export async function analyzeBatch(
  batch: LaudoFileInput[],
  rules: AnalysisRule[],
  preferredFreeModel?: string | null
): Promise<RepositoryAnalysisResult> {
  const freeResult = await runFreeStage(batch, rules, preferredFreeModel);

  const claude = getServiceClaudeConfig();
  if (!claude) {
    throw new Error('Nenhum provedor de IA disponível (nem gratuito, nem Claude/VPS).');
  }

  // parseFindingsJson's AnalysisFinding.line is `number | null | undefined`
  // (optional in the shared type), but buildFusionPrompt requires a
  // required `number | null` — normalize here since it's always explicitly
  // number|null at runtime already (parseFindingsJson never leaves it
  // undefined), just not reflected in the shared type.
  const freeFindings = (freeResult?.findings ?? []).map((f) => ({
    filePath: f.filePath,
    line: f.line ?? null,
    severity: f.severity,
    title: f.title,
    message: f.message,
  }));
  const userPrompt = buildFusionPrompt(batch, freeFindings, rules);
  // Um lote pode ter até 8 arquivos de até 20.000 caracteres cada — um prompt
  // bem maior que uma única diff de PR, capaz de gerar uma resposta bem maior
  // também. Os defaults de callAnthropicCompatible (45s / 4096 tokens) foram
  // dimensionados para o caso de PR única e truncariam/expirariam aqui.
  const raw = await callAnthropicCompatible(
    {
      apiKey: claude.apiKey,
      baseURL: claude.baseURL,
      model: claude.model,
      timeoutMs: 180_000,
      maxTokens: 8192,
    },
    LAUDO_FUSION_SYSTEM_PROMPT,
    userPrompt
  );
  const fusion = parseFusionJson(raw);

  const findings: LaudoFindingResult[] = fusion.findings.map((f: FusionFinding) => ({
    filePath: f.filePath,
    line: f.line,
    severity: f.severity,
    title: f.title,
    message: f.message,
    suggestion: f.suggestion,
    // Sem etapa gratuita não há o que confirmar — força false independente
    // do que o modelo tenha respondido, para não depender só da obediência
    // ao prompt.
    confirmedByBoth: freeResult ? f.confirmedByBoth : false,
  }));

  return {
    summary: fusion.summary,
    findings,
    freeModel: freeResult?.model ?? null,
    claudeModel: claude.model,
    usedClaudeOnly: !freeResult,
  };
}

/**
 * Executa a análise em duas etapas para todos os lotes e consolida os
 * resultados. `usedClaudeOnly` fica true se isso ocorreu em QUALQUER lote —
 * o repositório inteiro é tratado como uma unidade para fins de exibição.
 */
export async function analyzeBatches(
  batches: LaudoFileInput[][],
  rules: AnalysisRule[],
  preferredFreeModel?: string | null
): Promise<RepositoryAnalysisResult> {
  const summaries: string[] = [];
  const findings: LaudoFindingResult[] = [];
  let freeModel: string | null = null;
  let claudeModel: string | null = null;
  let usedClaudeOnly = false;

  for (const batch of batches) {
    const result = await analyzeBatch(batch, rules, preferredFreeModel);
    summaries.push(result.summary);
    findings.push(...result.findings);
    freeModel = freeModel ?? result.freeModel;
    claudeModel = claudeModel ?? result.claudeModel;
    if (result.usedClaudeOnly) usedClaudeOnly = true;
  }

  return {
    summary: summaries.filter(Boolean).join('\n\n'),
    findings,
    freeModel,
    claudeModel,
    usedClaudeOnly,
  };
}
