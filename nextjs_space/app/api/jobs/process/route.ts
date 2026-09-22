import { NextResponse } from 'next/server';
import { processPendingReviews } from '@/lib/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Endpoint para um agendador (cron) processar revisões pendentes/reprocessar
 * as que falharam. Protegido por um segredo compartilhado (WORKER_SECRET)
 * enviado no cabeçalho Authorization: Bearer <segredo>.
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

  const processed = await processPendingReviews();
  return NextResponse.json({ ok: true, processed });
}
