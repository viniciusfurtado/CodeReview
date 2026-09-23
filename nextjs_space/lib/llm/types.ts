// Tipos compartilhados da camada de análise por IA.

export type LlmProviderId = 'OPENROUTER' | 'ANTHROPIC';

// Origem da IA: 'SERVICE' usa a IA do próprio serviço (OpenRouter gratuito +
// fallback premium na VPS); 'BYOK' usa a chave própria da organização.
export type LlmMode = 'SERVICE' | 'BYOK';

export type Severity = 'INFO' | 'WARNING' | 'ERROR';

export interface AnalysisRule {
  name: string;
  instruction: string;
  severity: Severity;
}

export interface AnalysisInput {
  // Origem da IA. Quando omitido, assume 'SERVICE'.
  mode?: LlmMode;
  provider: LlmProviderId;
  model?: string | null;
  // Se a organização possui créditos para acionar o fallback premium (Claude/agy
  // na VPS) no modo SERVICE, ou o Claude pago no modo BYOK.
  hasCredits?: boolean;
  prTitle: string;
  branch?: string;
  diff: string;
  rules: AnalysisRule[];
}

export interface AnalysisFinding {
  filePath: string;
  line?: number | null;
  severity: Severity;
  title: string;
  message: string;
  suggestion?: string | null;
}

export interface AnalysisResult {
  summary: string;
  findings: AnalysisFinding[];
  provider: LlmProviderId;
  model: string;
  usedMock: boolean;
  // Rótulo legível da origem que efetivamente respondeu (ex.: "OpenRouter
  // (grátis) · nex-n2.5-pro", "Claude (VPS)", "Agy (VPS)").
  sourceLabel: string;
  // Indica se esta execução consome 1 crédito (fallback premium acionado).
  billable: boolean;
  // Indica se houve fallback em relação à primeira opção tentada.
  usedFallback: boolean;
}

// Modelos padrão por provedor (usados quando a organização não define um).
// OpenRouter usa um modelo GRATUITO de alto desempenho em codificação como
// padrão do serviço. Claude (pago) só é utilizado quando há créditos.
export const DEFAULT_MODELS: Record<LlmProviderId, string> = {
  OPENROUTER: 'nex-agi/nex-n2.5-pro:free',
  ANTHROPIC: 'claude-3-5-sonnet-latest',
};

// Provedores considerados pagos (consomem créditos da organização).
export const PAID_PROVIDERS: LlmProviderId[] = ['ANTHROPIC'];

export function isPaidProvider(provider: LlmProviderId): boolean {
  return PAID_PROVIDERS.includes(provider);
}

// Curadoria de modelos GRATUITOS do OpenRouter recomendados para análise de
// código. Os IDs terminam em ':free'. O catálogo gratuito do OpenRouter muda
// com frequência — o usuário também pode informar um modelo personalizado.
export interface OpenRouterFreeModel {
  id: string;
  label: string;
  recommended?: boolean;
}

export const OPENROUTER_FREE_MODELS: OpenRouterFreeModel[] = [
  {
    id: 'nex-agi/nex-n2.5-pro:free',
    label: 'Nex N2.5 Pro (gratuito) — recomendado para código',
    recommended: true,
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    label: 'NVIDIA Nemotron 3 Ultra 550B (gratuito)',
  },
  {
    id: 'qwen/qwen3.8-27b:free',
    label: 'Qwen 3.8 27B (gratuito)',
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    label: 'Google Gemma 4 26B (gratuito)',
  },
  {
    id: 'poolside/laguna-s-2.1:free',
    label: 'Poolside Laguna S 2.1 (gratuito)',
  },
];

// Modelos pagos sugeridos para o Claude (Anthropic).
export const ANTHROPIC_MODELS: { id: string; label: string }[] = [
  { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (mais econômico)' },
];

/**
 * Ordem de tentativa dos modelos GRATUITOS do OpenRouter: o modelo preferido
 * (se for um modelo ':free' válido) vem primeiro, seguido pela curadoria
 * padrão (sem duplicar). Usado para failover automático quando um modelo
 * gratuito está instável ou com alta latência.
 */
export function freeModelOrder(preferred?: string | null): string[] {
  const curated = OPENROUTER_FREE_MODELS.map((m) => m.id);
  const order: string[] = [];
  const pref = (preferred ?? '').trim();
  if (pref && pref.endsWith(':free')) order.push(pref);
  for (const id of curated) {
    if (!order.includes(id)) order.push(id);
  }
  // Garante ao menos o modelo padrão.
  if (!order.includes(DEFAULT_MODELS.OPENROUTER)) {
    order.unshift(DEFAULT_MODELS.OPENROUTER);
  }
  return order;
}

// Configuração do fallback premium hospedado na VPS (Claude com licença mensal
// e/ou 'agy' local). São opcionais: quando as variáveis de ambiente não estão
// definidas, o fallback é simplesmente ignorado.
export interface ServiceEndpointConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export function getServiceClaudeConfig(): ServiceEndpointConfig | null {
  const baseURL = process.env.SERVICE_CLAUDE_BASE_URL;
  const apiKey = process.env.SERVICE_CLAUDE_API_KEY;
  const model = process.env.SERVICE_CLAUDE_MODEL || 'claude-3-5-sonnet-latest';
  if (!baseURL || !apiKey) return null;
  return { baseURL, apiKey, model };
}

export function getServiceAgyConfig(): ServiceEndpointConfig | null {
  const baseURL = process.env.SERVICE_AGY_BASE_URL;
  const apiKey = process.env.SERVICE_AGY_API_KEY;
  const model = process.env.SERVICE_AGY_MODEL || 'agy';
  if (!baseURL || !apiKey) return null;
  return { baseURL, apiKey, model };
}