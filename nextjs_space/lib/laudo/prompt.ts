import { extractJsonObject, coerceSeverity } from '@/lib/llm/client';
import type { AnalysisRule, Severity } from '@/lib/llm/types';

export interface LaudoFileInput {
  relativePath: string;
  content: string;
}

function formatRules(rules: AnalysisRule[]): string {
  if (rules.length === 0) {
    return 'Nenhuma regra personalizada. Use boas práticas gerais de engenharia de software.';
  }
  return rules.map((r, i) => `${i + 1}. [${r.severity}] ${r.name}: ${r.instruction}`).join('\n');
}

function formatFiles(files: LaudoFileInput[]): string {
  return files
    .map((f) => `### Arquivo: ${f.relativePath}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');
}

export const LAUDO_SYSTEM_PROMPT = `Você é um revisor de código sênior, criterioso e objetivo, produzindo um laudo técnico de qualidade de um repositório inteiro (não um diff de PR).
Analise os arquivos fornecidos e aplique RIGOROSAMENTE as regras informadas.
Aponte apenas problemas reais e relevantes; não invente arquivos ou linhas que não estejam no conteúdo fornecido.
Quando não houver problemas em um lote de arquivos, retorne uma lista de apontamentos vazia.

Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown e sem texto extra, no formato:
{
  "summary": "resumo curto em português do que foi avaliado neste lote",
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

export function buildLaudoBatchPrompt(files: LaudoFileInput[], rules: AnalysisRule[]): string {
  return `Lote de arquivos do repositório para revisão de qualidade:

Regras a aplicar:
${formatRules(rules)}

${formatFiles(files)}

Retorne apenas o JSON no formato especificado.`;
}

export const LAUDO_FUSION_SYSTEM_PROMPT = `Você é um revisor de código sênior fazendo uma DUPLA CHECAGEM de apontamentos gerados por outra IA sobre um lote de arquivos de um repositório.
Sua tarefa:
1. Reveja o conteúdo dos arquivos você mesmo, de forma independente.
2. Para cada apontamento da primeira IA: mantenha se for válido e relevante, corrija título/mensagem/severidade se estiver impreciso, ou descarte se for incorreto/irrelevante/inventado.
3. Adicione novos apontamentos que a primeira IA deixou passar.
4. Marque "confirmedByBoth": true para apontamentos que você manteve validando o que a primeira IA já tinha encontrado (mesmo arquivo+linha+problema). Marque "confirmedByBoth": false para apontamentos que só você identificou (novos, ou reescritos a partir de um apontamento que você considerou incorreto na origem).

Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown e sem texto extra, no formato:
{
  "summary": "resumo curto em português da dupla checagem deste lote",
  "findings": [
    {
      "filePath": "caminho/do/arquivo",
      "line": 42,
      "severity": "INFO | WARNING | ERROR",
      "title": "título curto do problema",
      "message": "explicação objetiva do problema",
      "suggestion": "como corrigir (opcional)",
      "confirmedByBoth": true
    }
  ]
}
Toda a linguagem natural deve estar em português do Brasil.`;

export interface FusionFinding {
  filePath: string;
  line: number | null;
  severity: Severity;
  title: string;
  message: string;
  suggestion: string | null;
  confirmedByBoth: boolean;
}

export function buildFusionPrompt(
  files: LaudoFileInput[],
  freeFindings: { filePath: string; line: number | null; severity: Severity; title: string; message: string }[],
  rules: AnalysisRule[]
): string {
  const freeFindingsText =
    freeFindings.length === 0
      ? 'Nenhum apontamento foi gerado pela primeira IA para este lote.'
      : freeFindings
          .map(
            (f, i) =>
              `${i + 1}. [${f.severity}] ${f.filePath}${f.line ? `:${f.line}` : ''} — ${f.title}: ${f.message}`
          )
          .join('\n');

  return `Lote de arquivos do repositório:

Regras a aplicar:
${formatRules(rules)}

${formatFiles(files)}

Apontamentos da primeira IA para este mesmo lote:
${freeFindingsText}

Retorne apenas o JSON no formato especificado, incluindo "confirmedByBoth" em cada apontamento.`;
}

export function parseFusionJson(raw: string): { summary: string; findings: FusionFinding[] } {
  const data = JSON.parse(extractJsonObject(raw));
  const findings: FusionFinding[] = Array.isArray(data.findings)
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
        confirmedByBoth: Boolean(f.confirmedByBoth),
      }))
    : [];
  return { summary: String(data.summary ?? 'Dupla checagem concluída.'), findings };
}
