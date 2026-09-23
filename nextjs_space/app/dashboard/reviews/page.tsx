import Link from 'next/link';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import {
  GitPullRequest,
  GitBranch,
  ChevronRight,
  AlertCircle,
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
import { ReviewAutoRefresh } from '@/components/review-auto-refresh';
import { ACTIVE_REVIEW_STATUSES } from '@/lib/review-status';

export const dynamic = 'force-dynamic';

function statusBadge(
  status: string,
  counts: { errorCount: number; warningCount: number; infoCount: number }
) {
  switch (status) {
    case 'COMPLETED':
      if (counts.errorCount > 0 || counts.warningCount > 0) {
        return { variant: 'warning' as const, label: 'Aguardando Ajustes' };
      }
      if (counts.infoCount > 0) {
        return { variant: 'secondary' as const, label: 'Ajustes Sugeridos' };
      }
      return { variant: 'success' as const, label: 'Concluída' };
    case 'IN_PROGRESS':
      return { variant: 'warning' as const, label: 'Em andamento' };
    case 'FAILED':
      return { variant: 'destructive' as const, label: 'Falhou' };
    default:
      return { variant: 'outline' as const, label: 'Na fila' };
  }
}

function prLifecycleBadge(
  review: { status: string; prClosedAt: Date | null; prMerged: boolean }
): { variant: 'success' | 'secondary' | 'outline'; label: string } | null {
  if (review.status !== 'COMPLETED') return null;
  if (!review.prClosedAt) return { variant: 'outline', label: 'Aguardando Merge' };
  if (review.prMerged) return { variant: 'success', label: 'Mergeado' };
  return { variant: 'secondary', label: 'Fechada sem merge' };
}

function severityVariant(sev: string) {
  switch (sev) {
    case 'ERROR':
      return 'destructive' as const;
    case 'WARNING':
      return 'warning' as const;
    default:
      return 'secondary' as const;
  }
}

export default async function ReviewsPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/');

  const orgIds = await getUserOrgIds(userId);

  const reviews = await prisma.pullRequestReview.findMany({
    where: { repository: { organizationId: { in: orgIds } } },
    include: {
      repository: true,
      findings: { select: { id: true, severity: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const hasActiveReview = reviews.some((r) =>
    ACTIVE_REVIEW_STATUSES.includes(r.status as string)
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <ReviewAutoRefresh active={hasActiveReview} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revisões</h1>
        <p className="text-muted-foreground">
          Revisões automáticas de Pull Requests geradas pela IA.
        </p>
      </div>

      {reviews.length === 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Nenhuma revisão ainda</CardTitle>
            <CardDescription>
              Assim que um Pull Request for aberto em um repositório ativo, a
              revisão automática aparecerá aqui.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-3">
        {reviews.map((review) => {
          const errorCount = review.findings.filter(
            (f) => (f.severity as string) === 'ERROR'
          ).length;
          const warnCount = review.findings.filter(
            (f) => (f.severity as string) === 'WARNING'
          ).length;
          const infoCount = review.findings.filter(
            (f) => (f.severity as string) === 'INFO'
          ).length;
          const badge = statusBadge(review.status as string, {
            errorCount,
            warningCount: warnCount,
            infoCount,
          });
          const lifecycleBadge = prLifecycleBadge(review);
          return (
            <Link key={review.id} href={`/dashboard/reviews/${review.id}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center gap-4 p-4">
                  <GitPullRequest className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {review.prTitle}
                      </span>
                      <span className="shrink-0 text-sm text-muted-foreground">
                        #{review.prNumber}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="truncate">
                        {review.repository.fullName}
                      </span>
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
                        options={{ dateStyle: 'medium' }}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {errorCount > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errorCount}
                      </Badge>
                    )}
                    {warnCount > 0 && (
                      <Badge variant="warning">{warnCount}</Badge>
                    )}
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {lifecycleBadge && (
                      <Badge variant={lifecycleBadge.variant}>
                        {lifecycleBadge.label}
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
