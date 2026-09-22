import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId, userCanAccessOrg } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

async function loadOwnedRule(userId: string, id: string) {
  const rule = await prisma.reviewRule.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!rule) return { error: 'Não encontrado', status: 404 as const };
  const allowed = await userCanAccessOrg(userId, rule.organizationId);
  if (!allowed) return { error: 'Sem permissão', status: 403 as const };
  return { rule };
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
  const owned = await loadOwnedRule(userId, id);
  if ('error' in owned) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const body = (await request.json()) as {
    enabled?: boolean;
    name?: string;
    description?: string;
    instruction?: string;
    severity?: string;
  };

  const data: Record<string, unknown> = {};
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
  if (body.name) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.instruction) data.instruction = body.instruction;
  if (['INFO', 'WARNING', 'ERROR'].includes(body.severity ?? ''))
    data.severity = body.severity;

  const updated = await prisma.reviewRule.update({ where: { id }, data });
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
  const owned = await loadOwnedRule(userId, id);
  if ('error' in owned) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }
  await prisma.reviewRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
