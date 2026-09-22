import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId, getUserOrgIds } from '@/lib/dashboard';
import { processReview } from '@/lib/queue';

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

  try {
    await processReview(id);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Falha ao processar análise.',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
