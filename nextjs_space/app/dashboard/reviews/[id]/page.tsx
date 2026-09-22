import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Image from 'next/image';
import {
  GitPullRequest,
  GitBranch,
  ArrowLeft,
  FileCode,
  AlertCircle,
  AlertTriangle,
  Info,
  Lightbulb,
} from 'lucide-react';
import { prisma } from '@/lib/db';
import { getCurrentUserId, getUserOrgIds } from '@/lib/dashboard';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SafeDate } from '@/components/safe-format';
import { RunAnalysisButton } from '@/components/run-analysis-button';

export const dynamic = 'force-dynamic';

function statusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
      return { variant: 'success' as const, label: 'Concluída' };
    case 'IN_PROGRESS':
      return { variant: 'warning' as const, label: 'Em andamento' };
    case 'FAILED':
      return { variant: 'destructive' as const, label: 'Falhou' };
    default:
      return { variant: 'outline' as const, label: 'Na fila' };
  }
}

function severityMeta(sev: string) {
  switch (sev) {
    case 'ERROR':
      return {
        variant: 'destructive' as const,
        label: 'Erro',
        Icon: AlertCircle,
      };
    case 'WARNING':
      return {
        variant: 'warning' as const,
        label: 'Atenção',
        Icon: AlertTriangle,
      };
    default:
      return { variant: 'secondary' as const, label: 'Info', Icon: Info };
  }
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) redirect('/');

  const orgIds = await getUserOrgIds(userId);

  const review = await prisma.pullRequestReview.findUnique({
    where: { id },
    include: {
      repository: { include: { organization: true } },
      findings: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!review || !orgIds.includes(review.repository.organizationId)) {
    notFound();
  }

  const badge = statusBadge(review.status as string);
  const canRun =
    review.status === 'PENDING' || review.status === 'FAILED';

  // Não expor o motor de IA interno (provedor/modelo) do modo SERVICE ao
  // cliente — apenas indicar se foi a IA gerenciada pelo serviço ou a chave
  // própria da organização (BYOK), que é a origem que o próprio cliente escolheu.
  const analyzedWithLabel =
    review.repository.organization.llmMode === 'BYOK'
      ? review.llmProvider === 'ANTHROPIC'
        ? 'Claude (Anthropic) · sua chave'
        : review.llmProvider === 'OPENROUTER'
          ? 'OpenRouter · sua chave'
          : 'Chave própria'
      : 'IA Serviço (Créditos)';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/dashboard/reviews"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para revisões
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <GitPullRequest className="h-5 w-5 shrink-0 text-primary" />
                <CardTitle className="text-lg">{review.prTitle}</CardTitle>
                <span className="text-muted-foreground">#{review.prNumber}</span>
              </div>
              <CardDescription className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{review.repository.fullName}</span>
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {review.branch}
                </span>
                <span className="flex items-center gap-1">
                  {review.authorAvatar ? (
                    <Image
                      src={review.authorAvatar}
                      alt={review.author}
                      width={16}
                      height={16}
                      className="rounded-full"
                    />
                  ) : null}
                  {review.author}
                </span>
                <SafeDate
                  date={review.updatedAt}
                  options={{ dateStyle: 'medium', timeStyle: 'short' }}
                />
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge variant={badge.variant}>{badge.label}</Badge>
              {canRun && <RunAnalysisButton reviewId={review.id} />}
            </div>
          </div>
        </CardHeader>
        {(review.summary || review.error || review.llmProvider) && (
          <CardContent className="space-y-3">
            {review.summary && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Resumo da IA</h3>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {review.summary}
                </p>
              </div>
            )}
            {review.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  Erro na última execução (tentativas: {review.attempts})
                </div>
                <p className="text-sm text-muted-foreground">{review.error}</p>
              </div>
            )}
            {review.llmProvider && (
              <p className="text-xs text-muted-foreground">
                Analisado com{' '}
                <span className="font-medium">{analyzedWithLabel}</span>
                {review.repository.organization.llmMode === 'BYOK' &&
                review.llmModel
                  ? ` · ${review.llmModel}`
                  : ''}
              </p>
            )}
            {review.status === 'COMPLETED' && (
              <div className="flex items-center gap-2 pt-1">
                {review.postedToGithub ? (
                  <>
                    <Badge variant="success" className="text-xs">
                      ✅ Postado no GitHub
                    </Badge>
                    {review.githubReviewId && (
                      <a
                        href={`https://github.com/${review.repository.fullName}/pull/${review.prNumber}#pullrequestreview-${review.githubReviewId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline hover:no-underline"
                      >
                        Ver no GitHub ↗
                      </a>
                    )}
                  </>
                ) : review.postError ? (
                  <span className="text-xs text-destructive">
                    ⚠️ Falha ao postar no GitHub: {review.postError}
                  </span>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Somente interno
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Apontamentos ({review.findings.length})
        </h2>
        {review.findings.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {review.status === 'IN_PROGRESS'
                ? 'A análise ainda está em andamento.'
                : 'Nenhum apontamento — o código está de acordo com as regras.'}
            </CardContent>
          </Card>
        )}
        <div className="space-y-3">
          {review.findings.map((finding) => {
            const meta = severityMeta(finding.severity as string);
            return (
              <Card key={finding.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <meta.Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{finding.title}</span>
                    </div>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileCode className="h-3 w-3" />
                    <code>
                      {finding.filePath}
                      {finding.line ? `:${finding.line}` : ''}
                    </code>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {finding.message}
                  </p>
                  {finding.suggestion && (
                    <div className="rounded-md border border-border bg-muted/40 p-3">
                      <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-foreground">
                        <Lightbulb className="h-3 w-3" />
                        Sugestão
                      </div>
                      <p className="whitespace-pre-line text-sm text-muted-foreground">
                        {finding.suggestion}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
