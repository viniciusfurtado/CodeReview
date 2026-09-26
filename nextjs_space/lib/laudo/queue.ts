import { prisma } from '@/lib/db';
import { getInstallationToken } from '@/lib/github/auth';
import {
  isAllowedPublicGitUrl,
  createTempCloneDir,
  removeDirSafely,
  cloneRepository,
  buildAuthenticatedCloneUrl,
} from './git';
import { scanRepository, groupIntoBatches, readBatchContents } from './scan';
import { analyzeBatches } from './analyze';
import { computeLaudoScore, shouldChargeForLaudo, EMPTY_REPOSITORY_SUMMARY } from './score';
import { generateLaudoPdf } from './pdf';
import { generateLaudoMarkdown } from './markdown';
import { saveLaudoArtifact } from './storage';
import { LAUDO_CREDIT_COST } from './constants';
import type { AnalysisRule, Severity } from '@/lib/llm/types';

const MAX_ATTEMPTS = 3;

export async function enqueueLaudo(laudoId: string): Promise<void> {
  await prisma.laudo.update({
    where: { id: laudoId },
    data: { status: 'PENDING', queuedAt: new Date(), error: null },
  });
}

export async function processLaudo(laudoId: string): Promise<void> {
  const laudo = await prisma.laudo.findUnique({
    where: { id: laudoId },
    include: { organization: true, repository: true },
  });
  if (!laudo) return;
  if (laudo.status === 'IN_PROGRESS') return;

  await prisma.laudo.update({
    where: { id: laudoId },
    data: { status: 'IN_PROGRESS', startedAt: new Date(), attempts: { increment: 1 } },
  });

  let cloneDir: string | null = null;

  try {
    // -----------------------------------------------------------------------
    // Etapa 1: obter o código-fonte via clone raso, isolado, sempre removido.
    // -----------------------------------------------------------------------
    cloneDir = await createTempCloneDir('laudo-');
    let cloneUrl: string;
    let branch: string | undefined = laudo.branch ?? undefined;

    if (laudo.source === 'REGISTERED') {
      if (!laudo.repository) throw new Error('Repositório cadastrado não encontrado.');
      if (!laudo.organization.installationId || laudo.organization.installationSuspended) {
        throw new Error('Organização sem instalação do GitHub App ativa.');
      }
      const token = await getInstallationToken(laudo.organization.installationId);
      cloneUrl = buildAuthenticatedCloneUrl(laudo.repository.fullName, token);
      branch = branch ?? laudo.repository.defaultBranch;
    } else {
      if (!laudo.publicRepoUrl || !isAllowedPublicGitUrl(laudo.publicRepoUrl)) {
        throw new Error('URL de repositório público inválida ou não permitida.');
      }
      cloneUrl = laudo.publicRepoUrl;
    }

    await cloneRepository({ url: cloneUrl, targetDir: cloneDir, branch });

    // -----------------------------------------------------------------------
    // Etapa 2: selecionar arquivos relevantes com limites de segurança.
    // -----------------------------------------------------------------------
    const scan = await scanRepository(cloneDir);

    const ruleRows = await prisma.reviewRule.findMany({
      where: { organizationId: laudo.organizationId, enabled: true },
    });
    const rules: AnalysisRule[] = ruleRows.map((r) => ({
      name: r.name,
      instruction: r.instruction,
      severity: r.severity as Severity,
    }));

    let summary: string;
    let findings: Awaited<ReturnType<typeof analyzeBatches>>['findings'] = [];
    let freeModel: string | null = null;
    let claudeModel: string | null = null;
    let usedClaudeOnly = false;

    if (scan.files.length === 0) {
      summary = EMPTY_REPOSITORY_SUMMARY;
    } else {
      const batches = groupIntoBatches(scan.files);
      const contentBatches = await Promise.all(batches.map(readBatchContents));
      const result = await analyzeBatches(contentBatches, rules, laudo.organization.llmModel);
      summary = result.summary || 'Análise concluída.';
      findings = result.findings;
      freeModel = result.freeModel;
      claudeModel = result.claudeModel;
      usedClaudeOnly = result.usedClaudeOnly;
    }

    const charge = shouldChargeForLaudo(scan.files.length);
    const score = charge ? computeLaudoScore(findings) : null;

    // -----------------------------------------------------------------------
    // Etapa 3: persistir resultado + descontar créditos (só quando cobrável).
    // -----------------------------------------------------------------------
    const ops: any[] = [
      prisma.laudoFinding.deleteMany({ where: { laudoId } }),
      prisma.laudo.update({
        where: { id: laudoId },
        data: {
          status: 'COMPLETED',
          summary,
          scoreLetter: score?.letter ?? null,
          scoreNumber: score?.number ?? null,
          filesScanned: scan.files.length,
          filesSkipped: scan.filesSkipped,
          truncated: scan.truncated,
          freeModel,
          claudeModel,
          usedClaudeOnly,
          completedAt: new Date(),
          error: null,
          findings: {
            create: findings.map((f) => ({
              filePath: f.filePath,
              line: f.line ?? null,
              severity: f.severity,
              title: f.title,
              message: f.message,
              suggestion: f.suggestion ?? null,
              source: f.confirmedByBoth ? 'CONFIRMED_BOTH' : 'CLAUDE_ONLY',
            })),
          },
        },
      }),
    ];
    if (charge) {
      ops.push(
        prisma.organization.update({
          where: { id: laudo.organizationId },
          data: { aiCredits: { decrement: LAUDO_CREDIT_COST } },
        }),
        prisma.creditTransaction.create({
          data: {
            organizationId: laudo.organizationId,
            type: 'USAGE',
            amount: LAUDO_CREDIT_COST,
            laudoId,
          },
        })
      );
    }
    await prisma.$transaction(ops);

    // -----------------------------------------------------------------------
    // Etapa 4: gerar e salvar os artefatos (PDF + Markdown).
    // -----------------------------------------------------------------------
    const savedFindings = await prisma.laudoFinding.findMany({
      where: { laudoId },
      orderBy: { createdAt: 'asc' },
    });
    const laudoWithRelations = await prisma.laudo.findUniqueOrThrow({
      where: { id: laudoId },
      include: { repository: true, organization: true },
    });

    const pdfBuffer = await generateLaudoPdf(laudoWithRelations, savedFindings);
    const markdownText = generateLaudoMarkdown(laudoWithRelations, savedFindings);

    await saveLaudoArtifact(laudoId, 'PDF', `laudo-${laudoId}.pdf`, pdfBuffer);
    await saveLaudoArtifact(laudoId, 'MARKDOWN', `laudo-${laudoId}.md`, Buffer.from(markdownText, 'utf8'));
  } catch (error: any) {
    const current = await prisma.laudo.findUnique({ where: { id: laudoId }, select: { attempts: true } });
    const attempts = current?.attempts ?? MAX_ATTEMPTS;
    const isFinal = attempts >= MAX_ATTEMPTS;
    await prisma.laudo.update({
      where: { id: laudoId },
      data: {
        status: isFinal ? 'FAILED' : 'PENDING',
        error: String(error?.message ?? error).slice(0, 2000),
      },
    });
    console.error(`[laudo] falha ao processar laudo ${laudoId}:`, error);
  } finally {
    if (cloneDir) await removeDirSafely(cloneDir);
  }
}

export async function processPendingLaudos(limit = 3): Promise<number> {
  const pending = await prisma.laudo.findMany({
    where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { queuedAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  for (const p of pending) {
    await processLaudo(p.id);
  }
  return pending.length;
}
