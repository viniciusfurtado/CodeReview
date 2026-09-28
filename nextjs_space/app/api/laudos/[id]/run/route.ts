import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId, getUserOrgIds } from '@/lib/dashboard';
import { enqueueLaudo, processLaudo } from '@/lib/laudo/queue';
import { LAUDO_CREDIT_COST, hasEnoughCreditsForLaudo } from '@/lib/laudo/constants';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const laudo = await prisma.laudo.findUnique({
    where: { id },
    include: { organization: { select: { id: true, aiCredits: true } } },
  });
  if (!laudo) {
    return NextResponse.json({ error: 'Laudo não encontrado' }, { status: 404 });
  }

  const orgIds = await getUserOrgIds(userId);
  if (!orgIds.includes(laudo.organizationId)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }
  if (laudo.status === 'IN_PROGRESS') {
    return NextResponse.json({ error: 'O laudo já está em andamento.' }, { status: 409 });
  }
  if (!hasEnoughCreditsForLaudo(laudo.organization.aiCredits)) {
    return NextResponse.json(
      { error: `Créditos insuficientes: o Laudo custa ${LAUDO_CREDIT_COST} créditos.` },
      { status: 402 }
    );
  }

  await enqueueLaudo(id);
  after(async () => {
    try {
      await processLaudo(id);
    } catch (err) {
      console.error(`[api] falha ao reprocessar laudo (laudoId=${id}):`, err);
    }
  });

  return NextResponse.json({ ok: true, status: 'queued' });
}
