import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUserId, getUserOrgIds } from '@/lib/dashboard';
import {
  NotificationsManager,
  type OrgWithChannels,
} from '@/components/notifications-manager';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/');

  const orgIds = await getUserOrgIds(userId);
  const organizations = await prisma.organization.findMany({
    where: { id: { in: orgIds }, installationId: { not: null } },
    include: {
      notificationChannels: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { name: 'asc' },
  });

  const orgs: OrgWithChannels[] = organizations.map((org) => ({
    id: org.id,
    name: org.name ?? org.githubLogin,
    channels: org.notificationChannels.map((c) => ({
      id: c.id,
      type: c.type as OrgWithChannels['channels'][number]['type'],
      label: c.label,
      target: c.target,
      enabled: c.enabled,
    })),
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <NotificationsManager orgs={orgs} />
    </div>
  );
}
