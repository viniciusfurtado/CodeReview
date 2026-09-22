import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUserId, getUserOrgIds } from '@/lib/dashboard';
import { RulesManager, type OrgWithRules } from '@/components/rules-manager';

export const dynamic = 'force-dynamic';

export default async function RulesPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/');

  const orgIds = await getUserOrgIds(userId);
  const organizations = await prisma.organization.findMany({
    where: { id: { in: orgIds }, installationId: { not: null } },
    include: {
      reviewRules: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { name: 'asc' },
  });

  const orgs: OrgWithRules[] = organizations.map((org) => ({
    id: org.id,
    name: org.name ?? org.githubLogin,
    login: org.githubLogin,
    rules: org.reviewRules.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      instruction: r.instruction,
      severity: r.severity as OrgWithRules['rules'][number]['severity'],
      enabled: r.enabled,
    })),
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <RulesManager orgs={orgs} />
    </div>
  );
}
