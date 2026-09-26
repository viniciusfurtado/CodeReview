import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUserId, getUserOrgIds } from '@/lib/dashboard';
import { NewLaudoForm } from '@/components/new-laudo-form';

export const dynamic = 'force-dynamic';

export default async function NewLaudoPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/');

  const orgIds = await getUserOrgIds(userId);
  const organizations = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    include: {
      repositories: { where: { isActive: true }, orderBy: { name: 'asc' } },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Novo Laudo</h1>
        <p className="text-muted-foreground">
          Escolha um repositório cadastrado ou informe um link público de git.
        </p>
      </div>
      <NewLaudoForm
        organizations={organizations.map((o) => ({
          id: o.id,
          label: o.name ?? o.githubLogin,
          credits: o.aiCredits,
          repositories: o.repositories.map((r) => ({
            id: r.id,
            fullName: r.fullName,
            defaultBranch: r.defaultBranch,
          })),
        }))}
      />
    </div>
  );
}
