import type { AnalysisInput, AnalysisRule } from './types';

/**
 * Instrução de sistema: define o papel do revisor e o formato de saída.
 * O modelo DEVE responder somente com JSON válido no formato especificado.
 */
export const SYSTEM_PROMPT = `Você é um revisor de código sênior, criterioso e objetivo.
Analise o diff de um Pull Request e aplique RIGOROSAMENTE as regras fornecidas.
Aponte apenas problemas reais e relevantes; não invente arquivos ou linhas que não estejam no diff.
Quando não houver problemas, retorne uma lista de apontamentos vazia.

Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown e sem texto extra, no formato:
{
  "summary": "resumo curto em português do que foi avaliado",
  "findings": [
    {
      "filePath": "caminho/do/arquivo",
      "line": 42,
      "severity": "INFO | WARNING | ERROR",
      "title": "título curto do problema",
      "message": "explicação objetiva do problema",
      "suggestion": "como corrigir (opcional)"
    }
  ]
}
Toda a linguagem natural (summary, title, message, suggestion) deve estar em português do Brasil.`;

function formatRules(rules: AnalysisRule[]): string {
  if (rules.length === 0) {
    return 'Nenhuma regra personalizada. Use boas práticas gerais de engenharia de software.';
  }
  return rules
    .map(
      (r, i) =>
        `${i + 1}. [${r.severity}] ${r.name}: ${r.instruction}`
    )
    .join('\n');
}

export function buildUserPrompt(input: AnalysisInput): string {
  // Limita o tamanho do diff para caber no contexto do modelo.
  const MAX_DIFF = 24000;
  const diff =
    input.diff.length > MAX_DIFF
      ? input.diff.slice(0, MAX_DIFF) + '\n... (diff truncado)'
      : input.diff;

  return `Pull Request: ${input.prTitle}
Branch: ${input.branch ?? 'desconhecida'}

Regras a aplicar:
${formatRules(input.rules)}

Diff do Pull Request:
\`\`\`diff
${diff}
\`\`\`

Retorne apenas o JSON no formato especificado.`;
}