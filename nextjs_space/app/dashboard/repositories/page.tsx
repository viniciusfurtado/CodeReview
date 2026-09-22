import { redirect } from 'next/navigation';
import Image from 'next/image';
import { FolderGit2, Lock, Globe, GitBranch } from 'lucide-react';
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
import { InstallAppButton } from '@/components/install-app-button';
import { RepoActiveToggle } from '@/components/repo-active-toggle';

export const dynamic = 'force-dynamic';

export default async function RepositoriesPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/');

  const orgIds = await getUserOrgIds(userId);
  const organizations = await prisma.organization.findMany({
    where: { id: { in: orgIds }, installationId: { not: null } },
    include: {
      repositories: { orderBy: { name: 'asc' } },
    },
    orderBy: { name: 'asc' },
  });

  const totalRepos = organizations.reduce(
    (acc, o) => acc + o.repositories.length,
    0
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Repositórios</h1>
        <p className="text-muted-foreground">
          Ative ou desative a revisão automática de código por repositório.
        </p>
      </div>

      {organizations.length === 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Nenhum repositório disponível</CardTitle>
            <CardDescription>
              Instale o GitHub App em uma organização para listar seus
              repositórios aqui.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InstallAppButton />
          </CardContent>
        </Card>
      )}

      {totalRepos > 0 && (
        <p className="text-sm text-muted-foreground">
          {totalRepos} repositório(s) em {organizations.length} organização(ões).
        </p>
      )}

      {organizations.map((org) => (
        <Card key={org.id}>
          <CardHeader>
            <div className="flex items-center gap-3">
              {org.avatarUrl ? (
                <Image
                  src={org.avatarUrl}
                  alt={org.githubLogin}
                  width={32}
                  height={32}
                  className="rounded-md"
                />
              ) : (
                <div className="h-8 w-8 rounded-md bg-secondary" />
              )}
              <div>
                <CardTitle className="text-base">
                  {org.name ?? org.githubLogin}
                </CardTitle>
                <CardDescription>@{org.githubLogin}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {org.repositories.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">
                Nenhum repositório conectado.
              </p>
            )}
            {org.repositories.map((repo) => (
              <div
                key={repo.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{repo.name}</span>
                    {repo.private ? (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" /> Privado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <Globe className="h-3 w-3" /> Público
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="truncate">{repo.fullName}</span>
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {repo.defaultBranch}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {repo.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                  <RepoActiveToggle
                    repoId={repo.id}
                    initialActive={repo.isActive}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
