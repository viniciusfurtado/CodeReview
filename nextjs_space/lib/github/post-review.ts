import { getOctokitForInstallation } from './auth';

// Limite da API do GitHub para comentários inline por review.
const MAX_INLINE_COMMENTS = 50;

/** Subconjunto do modelo ReviewFinding usado para postagem no GitHub. */
interface Finding {
  filePath: string;
  line: number | null;
  severity: string;
  title: string;
  message: string;
  suggestion: string | null;
}

interface PostReviewInput {
  installationId: bigint;
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  summary: string;
  findings: Finding[];
}

interface PostReviewResult {
  posted: boolean;
  githubReviewId: number | null;
  error?: string;
}

/**
 * Formata um finding como corpo de comentário inline no GitHub.
 */
function formatFindingBody(finding: Finding): string {
  const severityEmoji: Record<string, string> = {
    ERROR: '🔴',
    WARNING: '🟡',
    INFO: '🔵',
  };
  const emoji = severityEmoji[finding.severity] ?? '🔵';

  let body = `${emoji} **${finding.title}**\n\n${finding.message}`;
  if (finding.suggestion) {
    body += `\n\n💡 **Sugestão:** ${finding.suggestion}`;
  }
  return body;
}

/**
 * Formata os findings que não possuem linha válida como texto no corpo geral
 * do review (aparecem como comentário global, não inline).
 */
function formatGeneralFindings(findings: Finding[]): string {
  if (findings.length === 0) return '';

  const items = findings.map((f) => {
    const severityEmoji: Record<string, string> = {
      ERROR: '🔴',
      WARNING: '🟡',
      INFO: '🔵',
    };
    const emoji = severityEmoji[f.severity] ?? '🔵';
    let text = `- ${emoji} **${f.title}** (\`${f.filePath}\`): ${f.message}`;
    if (f.suggestion) {
      text += `\n  💡 ${f.suggestion}`;
    }
    return text;
  });

  return '\n\n---\n\n**Apontamentos gerais (sem linha específica):**\n\n' + items.join('\n\n');
}

/**
 * Posta o resultado da análise da IA como um PR Review no GitHub.
 *
 * Comentários inline são criados para findings que possuem filePath e line
 * válidos. Findings sem linha são agrupados no corpo geral do review.
 *
 * A chamada NÃO bloqueia o merge do PR (event = 'COMMENT').
 */
export async function postReviewToGitHub(
  input: PostReviewInput
): Promise<PostReviewResult> {
  const { installationId, repoFullName, prNumber, commitSha, summary, findings } = input;

  if (!installationId) {
    return { posted: false, githubReviewId: null, error: 'installationId ausente' };
  }

  try {
    const octokit = await getOctokitForInstallation(installationId);
    const [owner, repo] = repoFullName.split('/');

    if (!owner || !repo) {
      return {
        posted: false,
        githubReviewId: null,
        error: `repoFullName inválido: ${repoFullName}`,
      };
    }

    // Separa findings com linha (inline) dos sem linha (gerais).
    const inlineFindings = findings.filter(
      (f) => f.filePath && f.line !== null && f.line !== undefined && f.line > 0
    );
    const generalFindings = findings.filter(
      (f) => !f.filePath || f.line === null || f.line === undefined || f.line <= 0
    );

    // Monta o corpo geral do review.
    let body = `## 🤖 Revisão Automática de Código\n\n${summary}`;

    if (findings.length === 0) {
      body += '\n\n✅ Nenhum apontamento — o código está de acordo com as regras.';
    } else {
      body += `\n\n📊 **${findings.length} apontamento(s)** encontrado(s)`;
      const errors = findings.filter((f) => f.severity === 'ERROR').length;
      const warnings = findings.filter((f) => f.severity === 'WARNING').length;
      const infos = findings.filter((f) => f.severity === 'INFO').length;
      const parts: string[] = [];
      if (errors > 0) parts.push(`🔴 ${errors} erro(s)`);
      if (warnings > 0) parts.push(`🟡 ${warnings} atenção`);
      if (infos > 0) parts.push(`🔵 ${infos} info`);
      if (parts.length > 0) body += ` (${parts.join(', ')})`;
      body += '.';
    }

    // Adiciona findings sem linha ao corpo geral.
    body += formatGeneralFindings(generalFindings);

    body += '\n\n---\n<sub>Gerado por AI Code Review</sub>';

    // Monta comentários inline (limitados pelo máximo da API).
    const comments = inlineFindings.slice(0, MAX_INLINE_COMMENTS).map((f) => ({
      path: f.filePath,
      line: f.line!,
      body: formatFindingBody(f),
    }));

    // Se há findings inline que excederam o limite, menciona no corpo.
    if (inlineFindings.length > MAX_INLINE_COMMENTS) {
      const overflow = inlineFindings.length - MAX_INLINE_COMMENTS;
      body += `\n\n> ⚠️ ${overflow} apontamento(s) inline não foram exibidos aqui por exceder o limite do GitHub. Consulte o dashboard para a lista completa.`;
    }

    const response = await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitSha,
      event: 'COMMENT',
      body,
      comments: comments.length > 0 ? comments : undefined,
    });

    return {
      posted: true,
      githubReviewId: response.data.id,
    };
  } catch (error: any) {
    console.error(
      `[post-review] falha ao postar review no PR #${prNumber} de ${repoFullName}:`,
      error
    );
    return {
      posted: false,
      githubReviewId: null,
      error: String(error?.message ?? error).slice(0, 2000),
    };
  }
}

