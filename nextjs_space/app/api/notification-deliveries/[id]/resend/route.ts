import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId, userCanAccessOrg } from '@/lib/dashboard';
import { resendToChannel } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function POST(
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
    include: { channel: { select: { id: true, organizationId: true } } },
  });

  if (!delivery) {
    return NextResponse.json({ error: 'Entrega não encontrada' }, { status: 404 });
  }

  const allowed = await userCanAccessOrg(userId, delivery.channel.organizationId);
  if (!allowed) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const result = await resendToChannel(delivery.channel.id, delivery.reviewId);

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'Falha ao reenviar' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
