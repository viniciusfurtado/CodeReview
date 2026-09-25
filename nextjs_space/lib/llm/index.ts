import {
  AnalysisInput,
  AnalysisResult,
  AnalysisFinding,
  DEFAULT_MODELS,
  LlmProviderId,
  LlmMode,
  freeModelOrder,
  getServiceClaudeConfig,
  getServiceAgyConfig,
} from './types';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { callOpenAICompatible, callAnthropicCompatible, parseFindingsJson } from './client';

type RawResult = { summary: string; findings: AnalysisFinding[] };

// ---------------------------------------------------------------------------
// Fallback determinístico (sem chaves) — mantém a demonstração funcional.
// ---------------------------------------------------------------------------
function analyzeWithMock(input: AnalysisInput): RawResult {
  const files = Array.from(
    new Set(
      (input.diff.match(/^\+\+\+ b\/(.+)$/gm) ?? []).map((l) =>
        l.replace('+++ b/', '').trim()
      )
    )
  );
  const target = files[0] ?? 'src/arquivo.ts';
  const findings: AnalysisFinding[] = [
    {
      filePath: target,
      line: 1,
      severity: 'INFO',
      title: 'Análise simulada (chave de IA não configurada)',
      message:
        'Este é um apontamento de demonstração gerado sem chamar um provedor de IA real. Configure a IA do serviço (OpenRouter/VPS) ou uma chave própria para análises reais.',
      suggestion: 'Configure OPENROUTER_API_KEY (serviço) ou uma chave própria (BYOK).',
    },
  ];
  return {
    summary: `Análise simulada de "${input.prTitle}" cobrindo ${files.length || 1} arquivo(s). Configure um provedor de IA para revisões reais.`,
    findings,
  };
}

// ---------------------------------------------------------------------------
// Montagem da cadeia de candidatos (com failover por erro / latência).
// ---------------------------------------------------------------------------
interface Candidate {
  label: string;
  provider: LlmProviderId;
  model: string;
  billable: boolean;
  isMock?: boolean;
  run: () => Promise<RawResult>;
}

function buildCandidates(input: AnalysisInput): Candidate[] {
  const mode: LlmMode = input.mode ?? 'SERVICE';
  const candidates: Candidate[] = [];

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openRouterHeaders = {
    'HTTP-Referer': process.env.AUTH_URL ?? 'https://codereview.abacusai.app',
    'X-Title': 'AI Code Review',
  };
  const systemPrompt = SYSTEM_PROMPT;
  const userPrompt = buildUserPrompt(input);

  if (mode === 'BYOK') {
    const provider = input.provider;
    const model = input.model || DEFAULT_MODELS[provider];
    if (provider === 'ANTHROPIC' && anthropicKey) {
      candidates.push({
        label: `Claude (chave própria) · ${model}`,
        provider: 'ANTHROPIC',
        model,
        billable: false,
        run: () =>
          callAnthropicCompatible({ apiKey: anthropicKey, model }, systemPrompt, userPrompt).then(
            parseFindingsJson
          ),
      });
    } else if (provider === 'OPENROUTER' && openRouterKey) {
      candidates.push({
        label: `OpenRouter (chave própria) · ${model}`,
        provider: 'OPENROUTER',
        model,
        billable: false,
        run: () =>
          callOpenAICompatible(
            { apiKey: openRouterKey, baseURL: 'https://openrouter.ai/api/v1', model, headers: openRouterHeaders },
            systemPrompt,
            userPrompt
          ).then(parseFindingsJson),
      });
    }
  } else {
    if (openRouterKey) {
      for (const model of [...freeModelOrder(input.model), 'openrouter/free']) {
        candidates.push({
          label:
            model === 'openrouter/free'
              ? 'OpenRouter (grátis) · roteamento automático'
              : `OpenRouter (grátis) · ${model.replace(':free', '')}`,
          provider: 'OPENROUTER',
          model,
          billable: false,
          run: () =>
            callOpenAICompatible(
              { apiKey: openRouterKey, baseURL: 'https://openrouter.ai/api/v1', model, headers: openRouterHeaders },
              systemPrompt,
              userPrompt
            ).then(parseFindingsJson),
        });
      }
    }

    if (input.hasCredits) {
      const claude = getServiceClaudeConfig();
      if (claude) {
        candidates.push({
          label: `Claude (VPS) · ${claude.model}`,
          provider: 'ANTHROPIC',
          model: claude.model,
          billable: true,
          run: () =>
            callAnthropicCompatible(
              { apiKey: claude.apiKey, baseURL: claude.baseURL, model: claude.model },
              systemPrompt,
              userPrompt
            ).then(parseFindingsJson),
        });
      }
      const agy = getServiceAgyConfig();
      if (agy) {
        candidates.push({
          label: `Agy (VPS) · ${agy.model}`,
          provider: 'OPENROUTER',
          model: agy.model,
          billable: true,
          run: () =>
            callOpenAICompatible(
              { apiKey: agy.apiKey, baseURL: agy.baseURL, model: agy.model },
              systemPrompt,
              userPrompt
            ).then(parseFindingsJson),
        });
      }
    }
  }

  candidates.push({
    label: 'Análise simulada (sem provedor de IA)',
    provider: input.provider,
    model: input.model || DEFAULT_MODELS[input.provider],
    billable: false,
    isMock: true,
    run: async () => analyzeWithMock(input),
  });

  return candidates;
}

/**
 * Executa a análise de um Pull Request percorrendo a cadeia de candidatos.
 * Cada candidato é tentado em ordem; erros ou alta latência acionam o próximo
 * (failover). O último candidato é sempre a análise simulada, garantindo que a
 * função sempre retorne um resultado.
 */
export async function runAnalysis(input: AnalysisInput): Promise<AnalysisResult> {
  const candidates = buildCandidates(input);

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      const raw = await c.run();
      return {
        ...raw,
        provider: c.provider,
        model: c.model,
        usedMock: Boolean(c.isMock),
        sourceLabel: c.label,
        billable: c.billable && !c.isMock,
        usedFallback: i > 0,
      };
    } catch (error) {
      console.error(`[llm] candidato "${c.label}" falhou, tentando próximo:`, error);
      continue;
    }
  }

  const fallback = analyzeWithMock(input);
  return {
    ...fallback,
    provider: input.provider,
    model: input.model || DEFAULT_MODELS[input.provider],
    usedMock: true,
    sourceLabel: 'Análise simulada (sem provedor de IA)',
    billable: false,
    usedFallback: true,
  };
}

export { DEFAULT_MODELS } from './types';
export type { AnalysisInput, AnalysisResult, AnalysisFinding } from './types';
