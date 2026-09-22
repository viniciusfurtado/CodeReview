import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId, userCanAccessOrg } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

async function loadOwned(userId: string, id: string) {
  const channel = await prisma.notificationChannel.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!channel) return { error: 'Não encontrado', status: 404 as const };
  const allowed = await userCanAccessOrg(userId, channel.organizationId);
  if (!allowed) return { error: 'Sem permissão', status: 403 as const };
  return { channel };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const { id } = await params;
  const owned = await loadOwned(userId, id);
  if ('error' in owned) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }
  const body = (await request.json()) as {
    enabled?: boolean;
    label?: string;
    target?: string;
  };
  const data: Record<string, unknown> = {};
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
  if (body.label) data.label = body.label;
  if (body.target) data.target = body.target;

  const updated = await prisma.notificationChannel.update({
    where: { id },
    data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const { id } = await params;
  const owned = await loadOwned(userId, id);
  if ('error' in owned) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }
  await prisma.notificationChannel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
