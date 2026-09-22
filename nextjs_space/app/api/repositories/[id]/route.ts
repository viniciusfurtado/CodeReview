import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId, userCanAccessOrg } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as { isActive?: boolean };

  const repo = await prisma.repository.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!repo) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const allowed = await userCanAccessOrg(userId, repo.organizationId);
  if (!allowed) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const updated = await prisma.repository.update({
    where: { id },
    data: { isActive: Boolean(body.isActive) },
    select: { id: true, isActive: true },
  });

  return NextResponse.json(updated);
}
