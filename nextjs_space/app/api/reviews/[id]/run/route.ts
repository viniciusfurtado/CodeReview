import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId, getUserOrgIds } from '@/lib/dashboard';
import { enqueueReview, processReview } from '@/lib/queue';

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

  const review = await prisma.pullRequestReview.findUnique({
    where: { id },
    include: { repository: { select: { organizationId: true } } },
  });

  if (!review) {
    return NextResponse.json(
      { error: 'Revisão não encontrada' },
      { status: 404 }
    );
  }

  const orgIds = await getUserOrgIds(userId);
  if (!orgIds.includes(review.repository.organizationId)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  if (review.status === 'IN_PROGRESS') {
    return NextResponse.json(
      { error: 'A análise já está em andamento.' },
      { status: 409 }
    );
  }

  // Marca como PENDING de imediato (feedback rápido na UI) e processa em
  // segundo plano — mesmo padrão do webhook, evita segurar a resposta HTTP
  // pela duração inteira da chamada de IA.
  await enqueueReview(id);
  after(async () => {
    try {
      await processReview(id);
    } catch (err) {
      console.error(`[api] falha ao processar análise (reviewId=${id}):`, err);
    }
  });

  return NextResponse.json({ ok: true, status: 'queued' });
}
