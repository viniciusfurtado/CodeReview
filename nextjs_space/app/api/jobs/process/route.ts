import { NextResponse } from 'next/server';
import { processPendingReviews } from '@/lib/queue';
import { processPendingLaudos } from '@/lib/laudo/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Endpoint para um agendador (cron) processar revisões e laudos pendentes.
 * Protegido por um segredo compartilhado (WORKER_SECRET) enviado no
 * cabeçalho Authorization: Bearer <segredo>. As duas filas são independentes
 * (modelos diferentes), então processam em paralelo dentro do mesmo hit.
 */
export async function POST(req: Request) {
  const secret = process.env.WORKER_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'WORKER_SECRET não configurado' },
      { status: 503 }
    );
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const [processedReviews, processedLaudos] = await Promise.all([
    processPendingReviews(),
    processPendingLaudos(),
  ]);
  return NextResponse.json({ ok: true, processed: processedReviews, processedLaudos });
}
