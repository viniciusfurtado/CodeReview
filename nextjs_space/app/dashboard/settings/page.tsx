import { redirect } from 'next/navigation';
import Image from 'next/image';
import { Users, CheckCircle2, XCircle, Building2 } from 'lucide-react';
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
import { LlmSettings } from '@/components/llm-settings';

export const dynamic = 'force-dynamic';

function roleLabel(role: string) {
  switch (role) {
    case 'OWNER':
      return { label: 'Proprietário', variant: 'default' as const };
    case 'ADMIN':
      return { label: 'Administrador', variant: 'secondary' as const };
    default:
      return { label: 'Membro', variant: 'outline' as const };
  }
}

export default async function SettingsPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/');

  const orgIds = await getUserOrgIds(userId);
  const organizations = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    include: {
      members: { include: { user: true }, orderBy: { role: 'asc' } },
      _count: { select: { repositories: true, reviewRules: true } },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie suas organizações, membros e a instalação do App.
        </p>
      </div>

      {organizations.map((org) => {
        const installed = org.installationId !== null;
        return (
          <Card key={org.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {org.avatarUrl ? (
                    <Image
                      src={org.avatarUrl}
                      alt={org.githubLogin}
                      width={40}
                      height={40}
                      className="rounded-md"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
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
                {installed ? (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> App Instalado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <XCircle className="h-3 w-3" /> Não Instalado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-md border border-border p-3 text-center">
                  <div className="text-2xl font-bold">
                    {org._count.repositories}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Repositórios
                  </div>
                </div>
                <div className="rounded-md border border-border p-3 text-center">
                  <div className="text-2xl font-bold">
                    {org._count.reviewRules}
                  </div>
                  <div className="text-xs text-muted-foreground">Regras</div>
                </div>
                <div className="rounded-md border border-border p-3 text-center">
                  <div className="text-2xl font-bold">{org.members.length}</div>
                  <div className="text-xs text-muted-foreground">Membros</div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4" />
                  Membros
                </div>
                <div className="divide-y divide-border rounded-md border border-border">
                  {org.members.map((member) => {
                    const role = roleLabel(member.role as string);
                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-3 p-3"
                      >
                        <div className="flex items-center gap-3">
                          {member.user.avatarUrl ? (
                            <Image
                              src={member.user.avatarUrl}
                              alt={member.user.name ?? 'Membro'}
                              width={28}
                              height={28}
                              className="rounded-full"
                            />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-secondary" />
                          )}
                          <div className="text-sm">
                            <div className="font-medium">
                              {member.user.name ?? 'Sem nome'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {member.user.email}
                            </div>
                          </div>
                        </div>
                        <Badge variant={role.variant}>{role.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              <LlmSettings
                orgId={org.id}
                initialMode={org.llmMode as 'SERVICE' | 'BYOK'}
                initialProvider={org.llmProvider as 'OPENROUTER' | 'ANTHROPIC'}
                initialModel={org.llmModel}
                credits={org.aiCredits}
              />

              {!installed && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
                  <p className="mb-3 text-sm text-muted-foreground">
                    Instale o GitHub App nesta organização para começar a revisar
                    Pull Requests automaticamente.
                  </p>
                  <InstallAppButton />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
