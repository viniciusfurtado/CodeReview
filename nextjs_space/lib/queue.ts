import { prisma } from '@/lib/db';
import { runAnalysis } from '@/lib/llm';
import { postReviewToGitHub } from '@/lib/github/post-review';
import { notifyReviewCompleted } from '@/lib/notifications';
import {
  type AnalysisRule,
  type LlmProviderId,
  type LlmMode,
  type Severity,
} from '@/lib/llm/types';

const MAX_ATTEMPTS = 3;

/**
 * Coloca uma revisão na fila (status PENDING) de forma idempotente.
 */
export async function enqueueReview(reviewId: string): Promise<void> {
  await prisma.pullRequestReview.update({
    where: { id: reviewId },
    data: { status: 'PENDING', queuedAt: new Date(), error: null },
  });
}

/**
 * Processa uma única revisão: busca regras da organização, chama a IA e
 * grava o resumo + apontamentos. Idempotente por reviewId.
 */
export async function processReview(reviewId: string): Promise<void> {
  const review = await prisma.pullRequestReview.findUnique({
    where: { id: reviewId },
    include: {
      repository: { include: { organization: true } },
    },
  });

  if (!review) return;
  // Evita processamento concorrente duplicado.
  if (review.status === 'IN_PROGRESS') return;

  const org = review.repository.organization;

  await prisma.pullRequestReview.update({
    where: { id: reviewId },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  try {
    const ruleRows = await prisma.reviewRule.findMany({
      where: { organizationId: org.id, enabled: true },
    });
    const rules: AnalysisRule[] = ruleRows.map((r: { name: string; instruction: string; severity: string }) => ({
      name: r.name,
      instruction: r.instruction,
      severity: r.severity as Severity,
    }));

    // Regra de negócio: a cadeia de análise (runAnalysis) decide as origens.
    // - Modo SERVICE (padrão): OpenRouter gratuito com failover entre modelos
    //   free; fallback premium na VPS (Claude/agy) somente com créditos.
    // - Modo BYOK: usa o provedor/modelo próprio da organização.
    // O crédito só é consumido quando a execução for realmente cobrável
    // (result.billable), ou seja, quando o fallback premium é acionado.
    const mode = (org.llmMode ?? 'SERVICE') as LlmMode;
    const hasCredits = (org.aiCredits ?? 0) > 0;

    const result = await runAnalysis({
      mode,
      provider: org.llmProvider as LlmProviderId,
      model: org.llmModel,
      hasCredits,
      prTitle: review.prTitle,
      branch: review.branch,
      diff: review.diff ?? '',
      rules,
    });

    // Sem nenhum provedor de IA real disponível (nem gratuito, nem o
    // fallback pago com créditos) a cadeia cai no mock — isso não é um
    // resultado válido para o usuário, então tratamos como falha
    // definitiva de imediato (sem gastar as tentativas de retry, já que
    // reprocessar sem mudar a configuração vai falhar do mesmo jeito).
    if (result.usedMock) {
      const message =
        'Nenhum provedor de IA disponível para esta organização no momento. Verifique os créditos disponíveis ou tente novamente mais tarde.';
      await prisma.pullRequestReview.update({
        where: { id: reviewId },
        data: { status: 'FAILED', error: message, completedAt: new Date() },
      });
      console.error(`[queue] revisão ${reviewId} falhou: ${message}`);

      const baseUrl = process.env.NEXTAUTH_URL ?? 'https://codereview.app';
      try {
        await notifyReviewCompleted(org.id, {
          repoFullName: review.repository.fullName,
          prNumber: review.prNumber,
          prTitle: review.prTitle,
          author: review.author,
          branch: review.branch,
          summary: '',
          findingsCount: 0,
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
          status: 'FAILED',
          error: message,
          dashboardUrl: `${baseUrl}/dashboard/reviews/${reviewId}`,
          githubPrUrl: `https://github.com/${review.repository.fullName}/pull/${review.prNumber}`,
        });
      } catch (notifyError: any) {
        console.error(`[queue] falha ao notificar (reviewId=${reviewId}):`, notifyError);
      }
      return;
    }

    // Consome 1 crédito apenas quando a análise cobrável (premium/VPS) roda.
    // Decremento + registro no histórico andam juntos, na mesma transação.
    if (result.billable && !result.usedMock && hasCredits) {
      await prisma.$transaction([
        prisma.organization.update({
          where: { id: org.id },
          data: { aiCredits: { decrement: 1 } },
        }),
        prisma.creditTransaction.create({
          data: {
            organizationId: org.id,
            type: 'USAGE',
            amount: 1,
            reviewId,
          },
        }),
      ]);
    }

    // Substitui apontamentos anteriores (idempotência de reprocessamento).
    await prisma.$transaction([
      prisma.reviewFinding.deleteMany({ where: { reviewId } }),
      prisma.pullRequestReview.update({
        where: { id: reviewId },
        data: {
          status: 'COMPLETED',
          summary: result.summary,
          llmProvider: result.provider,
          llmModel: result.model,
          completedAt: new Date(),
          error: null,
          findings: {
            create: result.findings.map((f) => ({
              filePath: f.filePath,
              line: f.line ?? null,
              severity: f.severity,
              title: f.title,
              message: f.message,
              suggestion: f.suggestion ?? null,
            })),
          },
        },
      }),
    ]);

    // -----------------------------------------------------------------------
    // Etapa 5: posta o review de volta no PR do GitHub.
    // Falha na postagem NÃO reverte a análise salva — os resultados ficam
    // preservados internamente no dashboard mesmo se o post falhar.
    // -----------------------------------------------------------------------
    if (review.commitSha && org.installationId && !result.usedMock) {
      try {
        const savedFindings = await prisma.reviewFinding.findMany({
          where: { reviewId },
          orderBy: { createdAt: 'asc' },
        });

        const postResult = await postReviewToGitHub({
          installationId: org.installationId,
          repoFullName: review.repository.fullName,
          prNumber: review.prNumber,
          commitSha: review.commitSha,
          summary: result.summary,
          findings: savedFindings,
        });

        await prisma.pullRequestReview.update({
          where: { id: reviewId },
          data: {
            postedToGithub: postResult.posted,
            githubReviewId:
              postResult.githubReviewId !== null
                ? BigInt(postResult.githubReviewId)
                : null,
            postError: postResult.error ?? null,
          },
        });
      } catch (postError: any) {
        console.error(`[queue] falha ao postar review no GitHub (reviewId=${reviewId}):`, postError);
        await prisma.pullRequestReview.update({
          where: { id: reviewId },
          data: {
            postedToGithub: false,
            postError: String(postError?.message ?? postError).slice(0, 2000),
          },
        });
      }
    }

    // -----------------------------------------------------------------------
    // Etapa 6: notifica canais configurados (Slack, Discord, Teams, Email).
    // Falha no envio NÃO afeta o status da review.
    // -----------------------------------------------------------------------
    const baseUrl = process.env.NEXTAUTH_URL ?? 'https://codereview.app';
    try {
      const savedFindings = await prisma.reviewFinding.findMany({
        where: { reviewId },
        select: { severity: true },
      });
      await notifyReviewCompleted(org.id, {
        repoFullName: review.repository.fullName,
        prNumber: review.prNumber,
        prTitle: review.prTitle,
        author: review.author,
        branch: review.branch,
        summary: result.summary,
        findingsCount: savedFindings.length,
        errorCount: savedFindings.filter((f: { severity: string }) => f.severity === 'ERROR').length,
        warningCount: savedFindings.filter((f: { severity: string }) => f.severity === 'WARNING').length,
        infoCount: savedFindings.filter((f: { severity: string }) => f.severity === 'INFO').length,
        status: 'COMPLETED',
        dashboardUrl: `${baseUrl}/dashboard/reviews/${reviewId}`,
        githubPrUrl: `https://github.com/${review.repository.fullName}/pull/${review.prNumber}`,
      });
    } catch (notifyError: any) {
      console.error(`[queue] falha ao notificar (reviewId=${reviewId}):`, notifyError);
    }
  } catch (error: any) {
    const current = await prisma.pullRequestReview.findUnique({
      where: { id: reviewId },
      select: { attempts: true },
    });
    const attempts = current?.attempts ?? MAX_ATTEMPTS;
    const isFinal = attempts >= MAX_ATTEMPTS;
    await prisma.pullRequestReview.update({
      where: { id: reviewId },
      data: {
        status: isFinal ? 'FAILED' : 'PENDING',
        error: String(error?.message ?? error).slice(0, 2000),
      },
    });
    console.error(`[queue] falha ao processar revisão ${reviewId}:`, error);

    // Notifica falha definitiva (última tentativa esgotada).
    if (isFinal) {
      const baseUrl = process.env.NEXTAUTH_URL ?? 'https://codereview.app';
      try {
        await notifyReviewCompleted(org.id, {
          repoFullName: review.repository.fullName,
          prNumber: review.prNumber,
          prTitle: review.prTitle,
          author: review.author,
          branch: review.branch,
          summary: '',
          findingsCount: 0,
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
          status: 'FAILED',
          error: String(error?.message ?? error).slice(0, 500),
          dashboardUrl: `${baseUrl}/dashboard/reviews/${reviewId}`,
          githubPrUrl: `https://github.com/${review.repository.fullName}/pull/${review.prNumber}`,
        });
      } catch {
        // Silenciado — se notificação falha aqui, não há mais nada a fazer.
      }
    }
  }
}

/**
 * Processa revisões pendentes em lote (usado pelo endpoint de worker/cron).
 */
export async function processPendingReviews(limit = 5): Promise<number> {
  const pending = await prisma.pullRequestReview.findMany({
    where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { queuedAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  for (const p of pending) {
    await processReview(p.id);
  }
  return pending.length;
}