import Image from 'next/image';
import { redirect } from 'next/navigation';
import { CheckCircle2, XCircle, FolderGit2, Rocket } from 'lucide-react';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InstallAppButton } from '@/components/install-app-button';
import {
  DashboardReviewsChart,
  type DayBucket,
} from '@/components/dashboard-reviews-chart';

export const dynamic = 'force-dynamic';

export default async function DashboardHomePage() {
  const session = await auth();
  const userId = session?.user?.userId;
  if (!userId) {
    redirect('/');
  }

  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: {
      organization: {
        include: { _count: { select: { repositories: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const organizations = memberships.map((m: any) => m.organization);
  const hasAnyInstallation = organizations.some(
    (o: any) => o.installationId !== null
  );

  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const orgIds = organizations.map((o: any) => o.id);
  const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 13);
  since.setUTCHours(0, 0, 0, 0);

  const recentReviews = orgIds.length
    ? await prisma.pullRequestReview.findMany({
        where: {
          repository: { organizationId: { in: orgIds } },
          status: { in: ['COMPLETED', 'FAILED'] },
          updatedAt: { gte: since },
        },
        select: {
          status: true,
          updatedAt: true,
          findings: { select: { severity: true } },
        },
      })
    : [];

  const buckets = new Map<string, DayBucket>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: shortDateFormatter.format(d), good: 0, warning: 0, critical: 0 });
  }

  for (const review of recentReviews) {
    const key = review.updatedAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;

    if (review.status === 'FAILED') {
      bucket.critical++;
      continue;
    }
    const hasIssue = review.findings.some(
      (f: { severity: string }) => f.severity === 'ERROR' || f.severity === 'WARNING'
    );
    if (hasIssue) bucket.warning++;
    else bucket.good++;
  }

  const chartData = Array.from(buckets.values());

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
        <p className="text-muted-foreground">
          Gerencie as instalações do GitHub App nas suas organizações.
        </p>
      </div>

      {!hasAnyInstallation && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              <CardTitle>Como começar</CardTitle>
            </div>
            <CardDescription>
              Você ainda não instalou o GitHub App em nenhuma organização.
              Instale-o para começar a receber revisões automáticas de código
              nos seus Pull Requests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InstallAppButton />
          </CardContent>
        </Card>
      )}

      {hasAnyInstallation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revisões — últimos 14 dias</CardTitle>
            <CardDescription>
              Volume diário de revisões por resultado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DashboardReviewsChart data={chartData} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {organizations.map((org: any) => {
          const isInstalled = org.installationId !== null;
          return (
            <Card key={org.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {org.avatarUrl ? (
                      <Image
                        src={org.avatarUrl}
                        alt={org.githubLogin}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-md"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-secondary" />
                    )}
                    <div>
                      <CardTitle className="text-base">
                        {org.name ?? org.githubLogin}
                      </CardTitle>
                      <CardDescription>
                        @{org.githubLogin}
                        {org.isPersonal ? ' · Conta pessoal' : ''}
                      </CardDescription>
                    </div>
                  </div>
                  {isInstalled ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      App Instalado
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Não Instalado
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isInstalled ? (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="h-4 w-4" />
                      <span>
                        {org._count.repositories}{' '}
                        {org._count.repositories === 1
                          ? 'repositório'
                          : 'repositórios'}
                      </span>
                    </div>
                    <p>Instalado em {dateFormatter.format(org.updatedAt)}</p>
                    {org.installationSuspended && (
                      <Badge variant="destructive">Instalação suspensa</Badge>
                    )}
                  </div>
                ) : (
                  <InstallAppButton size="sm" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
