import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId, userCanAccessOrg } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

const VALID_SEVERITY = ['INFO', 'WARNING', 'ERROR'] as const;

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = (await request.json()) as {
    organizationId?: string;
    name?: string;
    description?: string;
    instruction?: string;
    severity?: string;
  };

  if (!body.organizationId || !body.name || !body.instruction) {
    return NextResponse.json(
      { error: 'Campos obrigatórios ausentes' },
      { status: 400 }
    );
  }

  const allowed = await userCanAccessOrg(userId, body.organizationId);
  if (!allowed) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const severity = VALID_SEVERITY.includes(body.severity as any)
    ? (body.severity as (typeof VALID_SEVERITY)[number])
    : 'WARNING';

  const rule = await prisma.reviewRule.create({
    data: {
      organizationId: body.organizationId,
      name: body.name,
      description: body.description ?? null,
      instruction: body.instruction,
      severity,
    },
  });

  return NextResponse.json(rule);
}
