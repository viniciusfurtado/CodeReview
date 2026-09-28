import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { prisma } from '@/lib/db';
import { getCurrentUserId, getUserOrgIds } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  const { id, artifactId } = await params;

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const artifact = await prisma.laudoArtifact.findUnique({
    where: { id: artifactId },
    include: { laudo: { select: { id: true, organizationId: true } } },
  });

  if (!artifact || artifact.laudo.id !== id) {
    return NextResponse.json({ error: 'Artefato não encontrado' }, { status: 404 });
  }

  const orgIds = await getUserOrgIds(userId);
  if (!orgIds.includes(artifact.laudo.organizationId)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const bytes = await readFile(artifact.filePath);
  const contentType = artifact.type === 'PDF' ? 'application/pdf' : 'text/markdown; charset=utf-8';

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${artifact.fileName}"`,
      'Content-Length': String(bytes.byteLength),
    },
  });
}
