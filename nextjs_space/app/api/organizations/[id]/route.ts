import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId, userCanAccessOrg } from '@/lib/dashboard';
import { isPaidProvider } from '@/lib/llm/types';

export const dynamic = 'force-dynamic';

const VALID_PROVIDERS = ['OPENROUTER', 'ANTHROPIC'] as const;
type ProviderId = (typeof VALID_PROVIDERS)[number];

const VALID_MODES = ['SERVICE', 'BYOK'] as const;
type ModeId = (typeof VALID_MODES)[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const canAccess = await userCanAccessOrg(userId, id);
  if (!canAccess) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  let body: { llmMode?: string; llmProvider?: string; llmModel?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const data: {
    llmMode?: ModeId;
    llmProvider?: ProviderId;
    llmModel?: string | null;
  } = {};

  if (body.llmMode !== undefined) {
    if (!VALID_MODES.includes(body.llmMode as ModeId)) {
      return NextResponse.json({ error: 'Modo inválido' }, { status: 400 });
    }
    data.llmMode = body.llmMode as ModeId;
  }

  const effectiveMode: ModeId =
    (data.llmMode as ModeId | undefined) ?? 'SERVICE';

  if (body.llmProvider !== undefined) {
    if (!VALID_PROVIDERS.includes(body.llmProvider as ProviderId)) {
      return NextResponse.json(
        { error: 'Provedor inválido' },
        { status: 400 }
      );
    }
    // Regra de negócio: no modo SERVICE, o Claude (fallback premium na VPS)
    // só é acionado quando há créditos. No modo BYOK a organização usa a
    // própria chave e paga o provedor diretamente (sem créditos).
    if (
      effectiveMode !== 'BYOK' &&
      isPaidProvider(body.llmProvider as ProviderId)
    ) {
      const current = await prisma.organization.findUnique({
        where: { id },
        select: { aiCredits: true },
      });
      if (!current || current.aiCredits <= 0) {
        return NextResponse.json(
          {
            error:
              'O Claude é um recurso pago. Adquira créditos ou utilize a sua própria chave (modo BYOK).',
          },
          { status: 402 }
        );
      }
    }
    data.llmProvider = body.llmProvider as ProviderId;
  }

  if (body.llmModel !== undefined) {
    data.llmModel =
      body.llmModel === null || body.llmModel.trim() === ''
        ? null
        : body.llmModel.trim();
  }

  const org = await prisma.organization.update({
    where: { id },
    data,
    select: { id: true, llmMode: true, llmProvider: true, llmModel: true },
  });

  return NextResponse.json({ ok: true, organization: org });
}
