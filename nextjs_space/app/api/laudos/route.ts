import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUserId, userCanAccessOrg } from '@/lib/dashboard';
import { processLaudo } from '@/lib/laudo/queue';
import { isAllowedPublicGitUrl } from '@/lib/laudo/git';
import { LAUDO_CREDIT_COST, hasEnoughCreditsForLaudo } from '@/lib/laudo/constants';

export const dynamic = 'force-dynamic';

const createLaudoSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('REGISTERED'),
    organizationId: z.string().min(1),
    repositoryId: z.string().min(1),
    branch: z.string().min(1).optional(),
  }),
  z.object({
    source: z.literal('PUBLIC_URL'),
    organizationId: z.string().min(1),
    publicRepoUrl: z.string().url(),
    branch: z.string().min(1).optional(),
  }),
]);

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createLaudoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }
  const input = parsed.data;

  const canAccess = await userCanAccessOrg(userId, input.organizationId);
  if (!canAccess) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const org = await prisma.organization.findUnique({ where: { id: input.organizationId } });
  if (!org) {
    return NextResponse.json({ error: 'Organização não encontrada' }, { status: 404 });
  }
  if (!hasEnoughCreditsForLaudo(org.aiCredits)) {
    return NextResponse.json(
      {
        error: `Créditos insuficientes: o Laudo custa ${LAUDO_CREDIT_COST} créditos e a organização tem ${org.aiCredits}.`,
      },
      { status: 402 }
    );
  }

  let repositoryId: string | null = null;
  let publicRepoUrl: string | null = null;

  if (input.source === 'REGISTERED') {
    const repo = await prisma.repository.findUnique({ where: { id: input.repositoryId } });
    if (!repo || repo.organizationId !== input.organizationId) {
      return NextResponse.json({ error: 'Repositório não encontrado' }, { status: 404 });
    }
    repositoryId = repo.id;
  } else {
    if (!isAllowedPublicGitUrl(input.publicRepoUrl)) {
      return NextResponse.json(
        {
          error:
            'URL de repositório pública inválida. Use um link HTTPS de github.com, gitlab.com ou bitbucket.org, sem credenciais.',
        },
        { status: 400 }
      );
    }
    publicRepoUrl = input.publicRepoUrl;
  }

  const laudo = await prisma.laudo.create({
    data: {
      organizationId: input.organizationId,
      requestedByUserId: userId,
      source: input.source,
      repositoryId,
      publicRepoUrl,
      branch: input.branch ?? null,
      status: 'PENDING',
      queuedAt: new Date(),
    },
  });

  after(async () => {
    try {
      await processLaudo(laudo.id);
    } catch (err) {
      console.error(`[api] falha ao processar laudo (laudoId=${laudo.id}):`, err);
    }
  });

  return NextResponse.json({ ok: true, id: laudo.id }, { status: 201 });
}
