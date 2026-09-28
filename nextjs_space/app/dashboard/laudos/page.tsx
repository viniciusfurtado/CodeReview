import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GitBranch, ChevronRight, Globe, FolderGit2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { SafeDate } from '@/components/safe-format';
import { GradeBadge } from '@/components/grade-badge';
import { ReviewAutoRefresh } from '@/components/review-auto-refresh';
import { ACTIVE_REVIEW_STATUSES } from '@/lib/review-status';
import type { ReviewGrade } from '@/lib/review-grade';

export const dynamic = 'force-dynamic';

function statusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
      return { variant: 'success' as const, label: 'Concluído' };
    case 'IN_PROGRESS':
      return { variant: 'warning' as const, label: 'Em andamento' };
    case 'FAILED':
      return { variant: 'destructive' as const, label: 'Falhou' };
    default:
      return { variant: 'outline' as const, label: 'Na fila' };
  }
}

export default async function LaudosPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/');

  const orgIds = await getUserOrgIds(userId);
  const laudos = await prisma.laudo.findMany({
    where: { organizationId: { in: orgIds } },
    include: { repository: true },
    orderBy: { updatedAt: 'desc' },
  });

  const hasActive = laudos.some((l) => ACTIVE_REVIEW_STATUSES.includes(l.status as string));

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <ReviewAutoRefresh active={hasActive} />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laudos</h1>
          <p className="text-muted-foreground">
            Laudos técnicos de qualidade de código, gerados por IA com dupla checagem.
          </p>
        </div>
        <Link href="/dashboard/laudos/new">
          <Button size="sm">Novo Laudo</Button>
        </Link>
      </div>

      {laudos.length === 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Nenhum laudo ainda</CardTitle>
            <CardDescription>
              Gere um laudo técnico de um repositório cadastrado ou de um link público de git.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-3">
        {laudos.map((laudo) => {
          const badge = statusBadge(laudo.status as string);
          const label =
            laudo.source === 'REGISTERED' && laudo.repository
              ? laudo.repository.fullName
              : (laudo.publicRepoUrl ?? '—');
          return (
            <Link key={laudo.id} href={`/dashboard/laudos/${laudo.id}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center gap-4 p-4">
                  {laudo.source === 'REGISTERED' ? (
                    <FolderGit2 className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <Globe className="h-5 w-5 shrink-0 text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{label}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {laudo.branch && (
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          {laudo.branch}
                        </span>
                      )}
                      <SafeDate date={laudo.updatedAt} options={{ dateStyle: 'medium' }} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {laudo.status === 'COMPLETED' && laudo.scoreLetter && (
                      <GradeBadge grade={laudo.scoreLetter as ReviewGrade} />
                    )}
                    <Badge variant={badge.variant}>{badge.label}</Badge>
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
