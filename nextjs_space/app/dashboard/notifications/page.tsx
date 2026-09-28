import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUserId, getUserOrgIds } from '@/lib/dashboard';
import {
  NotificationsManager,
  type OrgWithChannels,
} from '@/components/notifications-manager';
import {
  NotificationHistory,
  type DeliveryDTO,
} from '@/components/notification-history';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

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

  const deliveriesRaw = await prisma.notificationDelivery.findMany({
    where: { channel: { organizationId: { in: orgIds } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      channel: { select: { type: true, label: true } },
      review: {
        select: {
          id: true,
          prNumber: true,
          prTitle: true,
          repository: { select: { fullName: true } },
        },
      },
    },
  });

  const deliveries: DeliveryDTO[] = deliveriesRaw.map((d) => ({
    id: d.id,
    status: d.status as DeliveryDTO['status'],
    createdAt: d.createdAt.toISOString(),
    channelType: d.channel.type as DeliveryDTO['channelType'],
    channelLabel: d.channel.label,
    reviewId: d.review.id,
    repoFullName: d.review.repository.fullName,
    prNumber: d.review.prNumber,
    prTitle: d.review.prTitle,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
        <p className="text-muted-foreground">
          Escolha para onde enviar os resultados das revisões e acompanhe os envios.
        </p>
      </div>

      <Tabs defaultValue="channels">
        <TabsList>
          <TabsTrigger value="channels">Canais</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="channels" className="mt-4">
          <NotificationsManager orgs={orgs} hideHeader />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <NotificationHistory deliveries={deliveries} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
