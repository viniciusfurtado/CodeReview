import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.userId;

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: {
      organization: {
        include: {
          _count: { select: { repositories: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const organizations = memberships.map((m: any) => ({
    id: m.organization.id,
    githubOrgId: m.organization.githubOrgId,
    githubLogin: m.organization.githubLogin,
    name: m.organization.name,
    avatarUrl: m.organization.avatarUrl,
    isPersonal: m.organization.isPersonal,
    role: m.role,
    installationId: m.organization.installationId
      ? m.organization.installationId.toString()
      : null,
    isInstalled: m.organization.installationId !== null,
    installationSuspended: m.organization.installationSuspended,
    repositoryCount: m.organization._count.repositories,
    createdAt: m.organization.createdAt.toISOString(),
  }));

  return Response.json({ organizations });
}
