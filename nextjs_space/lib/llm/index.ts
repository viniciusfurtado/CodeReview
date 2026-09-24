import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import {
  AnalysisInput,
  AnalysisResult,
  AnalysisFinding,
  Severity,
  DEFAULT_MODELS,
  LlmProviderId,
  LlmMode,
  freeModelOrder,
  getServiceClaudeConfig,
  getServiceAgyConfig,
} from './types';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

// Tempo máximo por tentativa. Se um provedor demorar demais (alta latência),
// a chamada é abortada e a cadeia tenta a próxima opção (failover).
const LLM_TIMEOUT_MS = 45_000;

const VALID_SEVERITY: Severity[] = ['INFO', 'WARNING', 'ERROR'];

function coerceSeverity(value: unknown): Severity {
  const v = String(value ?? '').toUpperCase();
  return (VALID_SEVERITY as string[]).includes(v) ? (v as Severity) : 'WARNING';
}

/** Extrai o objeto JSON de uma resposta que pode vir com cercas de markdown. */
function parseJsonResponse(raw: string): {
  summary: string;
  findings: AnalysisFinding[];
} {
  let text = (raw ?? '').trim();
  // Remove cercas ```json ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();
  // Recorta do primeiro { ao último }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1) text = text.slice(first, last + 1);

  const data = JSON.parse(text);
  const findings: AnalysisFinding[] = Array.isArray(data.findings)
    ? data.findings.map((f: any) => ({
        filePath: String(f.filePath ?? f.file ?? 'desconhecido'),
        line:
          f.line === null || f.line === undefined || Number.isNaN(Number(f.line))
            ? null
            : Number(f.line),
        severity: coerceSeverity(f.severity),
        title: String(f.title ?? 'Apontamento'),
        message: String(f.message ?? ''),
        suggestion: f.suggestion ? String(f.suggestion) : null,
      }))
    : [];
  return {
    summary: String(data.summary ?? 'Análise concluída.'),
    findings,
  };
}

type RawResult = { summary: string; findings: AnalysisFinding[] };

// ---------------------------------------------------------------------------
// Cliente genérico compatível com OpenAI (OpenRouter, agy local na VPS, etc.)
// ---------------------------------------------------------------------------
async function analyzeOpenAICompatible(
  input: AnalysisInput,
  opts: { apiKey: string; baseURL: string; model: string; headers?: Record<string, string> }
): Promise<RawResult> {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    defaultHeaders: opts.headers,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 0,
  });

  const completion = await client.chat.completions.create({
    model: opts.model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(input) },
    ],
  });

  const content = completion.choices?.[0]?.message?.content ?? '';
  return parseJsonResponse(content);
}

// ---------------------------------------------------------------------------
// Cliente Anthropic Claude (chave própria ou instância na VPS via baseURL)
// ---------------------------------------------------------------------------
async function analyzeAnthropicCompatible(
  input: AnalysisInput,
  opts: { apiKey: string; model: string; baseURL?: string }
): Promise<RawResult> {
  // Com baseURL customizado (proxy VPS local), o SDK deve mandar a chave como
  // "Authorization: Bearer" (authToken) — é o que o cli-proxy espera. Sem
  // baseURL (API oficial da Anthropic), usa o esquema nativo dela ("x-api-key",
  // via apiKey).
  const client = new Anthropic({
    ...(opts.baseURL ? { authToken: opts.apiKey } : { apiKey: opts.apiKey }),
    baseURL: opts.baseURL,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 0,
  });

  const message = await client.messages.create({
    model: opts.model,
    max_tokens: 4096,
    temperature: 0.1,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
  });

  const block = message.content?.[0];
  const text = block && block.type === 'text' ? block.text : '';
  return parseJsonResponse(text);
}

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

  if (mode === 'BYOK') {
    // Modo BYOK: respeita o provedor/modelo escolhido pela organização usando a
    // chave própria. O usuário paga o provedor diretamente (sem créditos).
    const provider = input.provider;
    const model = input.model || DEFAULT_MODELS[provider];
    if (provider === 'ANTHROPIC' && anthropicKey) {
      candidates.push({
        label: `Claude (chave própria) · ${model}`,
        provider: 'ANTHROPIC',
        model,
        billable: false,
        run: () => analyzeAnthropicCompatible(input, { apiKey: anthropicKey, model }),
      });
    } else if (provider === 'OPENROUTER' && openRouterKey) {
      candidates.push({
        label: `OpenRouter (chave própria) · ${model}`,
        provider: 'OPENROUTER',
        model,
        billable: false,
        run: () =>
          analyzeOpenAICompatible(input, {
            apiKey: openRouterKey,
            baseURL: 'https://openrouter.ai/api/v1',
            model,
            headers: openRouterHeaders,
          }),
      });
    }
  } else {
    // Modo SERVICE (padrão): IA do próprio serviço.
    // 1) OpenRouter gratuito, com failover automático entre os modelos free
    //    curados. Por fim, "openrouter/free" — o próprio roteador da
    //    OpenRouter escolhe entre TODOS os modelos gratuitos disponíveis no
    //    momento, cobrindo casos em que a lista curada esteja indisponível
    //    (modelo descontinuado, rate-limit, etc.) sem depender de créditos.
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
            analyzeOpenAICompatible(input, {
              apiKey: openRouterKey,
              baseURL: 'https://openrouter.ai/api/v1',
              model,
              headers: openRouterHeaders,
            }),
        });
      }
    }

    // 2) Fallback premium hospedado na VPS (Claude com licença mensal e/ou agy).
    //    Só é acionado quando a organização tem créditos (recurso pago).
    if (input.hasCredits) {
      const claude = getServiceClaudeConfig();
      if (claude) {
        candidates.push({
          label: `Claude (VPS) · ${claude.model}`,
          provider: 'ANTHROPIC',
          model: claude.model,
          billable: true,
          run: () =>
            analyzeAnthropicCompatible(input, {
              apiKey: claude.apiKey,
              baseURL: claude.baseURL,
              model: claude.model,
            }),
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
            analyzeOpenAICompatible(input, {
              apiKey: agy.apiKey,
              baseURL: agy.baseURL,
              model: agy.model,
            }),
        });
      }
    }
  }

  // Fallback final: análise simulada (nunca falha).
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

  // Inalcançável (mock nunca falha), mas mantém o tipo satisfeito.
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
