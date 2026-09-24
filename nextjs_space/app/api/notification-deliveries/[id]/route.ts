import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId, userCanAccessOrg } from '@/lib/dashboard';
import { buildReviewNotificationData } from '@/lib/notifications';
import {
  formatSlack,
  formatDiscord,
  formatTeams,
  formatEmailHtml,
  formatEmailSubject,
} from '@/lib/notifications/formatters';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { id } = await params;
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id },
    include: { channel: true },
  });

  if (!delivery) {
    return NextResponse.json({ error: 'Entrega não encontrada' }, { status: 404 });
  }

  const allowed = await userCanAccessOrg(userId, delivery.channel.organizationId);
  if (!allowed) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const data = await buildReviewNotificationData(delivery.reviewId);
  if (!data) {
    return NextResponse.json({ error: 'Revisão não encontrada' }, { status: 404 });
  }

  let preview: { subject?: string; content: string };
  switch (delivery.channel.type) {
    case 'EMAIL':
      preview = { subject: formatEmailSubject(data), content: formatEmailHtml(data) };
      break;
    case 'SLACK':
      preview = { content: JSON.stringify(formatSlack(data), null, 2) };
      break;
    case 'DISCORD':
      preview = { content: JSON.stringify(formatDiscord(data), null, 2) };
      break;
    case 'TEAMS':
      preview = { content: JSON.stringify(formatTeams(data), null, 2) };
      break;
    default:
      preview = { content: '' };
  }

  return NextResponse.json({
    status: delivery.status,
    error: delivery.error,
    channelType: delivery.channel.type,
    channelLabel: delivery.channel.label,
    createdAt: delivery.createdAt,
    preview,
  });
}
