import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId, userCanAccessOrg } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['EMAIL', 'SLACK', 'DISCORD', 'TEAMS'] as const;

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = (await request.json()) as {
    organizationId?: string;
    type?: string;
    label?: string;
    target?: string;
  };

  if (
    !body.organizationId ||
    !body.type ||
    !VALID_TYPES.includes(body.type as any) ||
    !body.label ||
    !body.target
  ) {
    return NextResponse.json(
      { error: 'Campos obrigatórios ausentes' },
      { status: 400 }
    );
  }

  const allowed = await userCanAccessOrg(userId, body.organizationId);
  if (!allowed) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const channel = await prisma.notificationChannel.create({
    data: {
      organizationId: body.organizationId,
      type: body.type as (typeof VALID_TYPES)[number],
      label: body.label,
      target: body.target,
    },
  });

  return NextResponse.json(channel);
}
