import { redirect } from 'next/navigation';
import Image from 'next/image';
import { Users, CheckCircle2, XCircle, Building2, Coins } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';
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

function transactionTypeLabel(type: string) {
  switch (type) {
    case 'PURCHASE':
      return { label: 'Compra', variant: 'success' as const, sign: '+' };
    case 'ADJUSTMENT':
      return { label: 'Ajuste', variant: 'secondary' as const, sign: '' };
    default:
      return { label: 'Uso', variant: 'outline' as const, sign: '-' };
  }
}

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
      creditTransactions: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          review: {
            select: {
              prNumber: true,
              prTitle: true,
              repository: { select: { fullName: true } },
            },
          },
        },
      },
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
                      className="h-10 w-10 rounded-md"
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
                              alt={member.user.name ?? member.user.githubLogin}
                              width={28}
                              height={28}
                              className="h-7 w-7 rounded-full"
                            />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-secondary" />
                          )}
                          <div className="text-sm">
                            <div className="font-medium">
                              {member.user.name ?? `@${member.user.githubLogin}`}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {member.user.email ?? `@${member.user.githubLogin}`}
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

              {org.creditTransactions.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                      <Coins className="h-3.5 w-3.5" />
                    </span>
                    Histórico de créditos
                  </div>
                  <div className="divide-y divide-border rounded-md border border-border">
                    {org.creditTransactions.map((tx) => {
                      const meta = transactionTypeLabel(tx.type as string);
                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between gap-3 p-3"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                            <div className="text-sm">
                              {tx.review ? (
                                <div className="font-medium">
                                  {tx.review.repository.fullName} #
                                  {tx.review.prNumber}
                                </div>
                              ) : (
                                <div className="font-medium text-muted-foreground">
                                  {tx.note ?? '—'}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                <SafeDate
                                  date={tx.createdAt}
                                  options={{ dateStyle: 'medium', timeStyle: 'short' }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
                            <Coins className="h-3.5 w-3.5" />
                            {meta.sign}
                            {tx.amount}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
