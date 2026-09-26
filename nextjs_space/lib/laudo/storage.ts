import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';

const STORAGE_ROOT = process.env.LAUDO_STORAGE_DIR
  ? path.resolve(process.env.LAUDO_STORAGE_DIR)
  : path.resolve(process.cwd(), 'data', 'laudos');

/**
 * Salva um artefato do laudo em disco (persistente na VPS onde a aplicação
 * roda diretamente — não uma plataforma serverless/efêmera) e registra a
 * linha correspondente em LaudoArtifact. O caminho salvo NUNCA é exposto
 * diretamente ao cliente — o download passa sempre pela rota autenticada.
 */
export async function saveLaudoArtifact(
  laudoId: string,
  type: 'PDF' | 'MARKDOWN',
  fileName: string,
  content: Buffer
): Promise<void> {
  const dir = path.join(STORAGE_ROOT, laudoId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, content);

  await prisma.laudoArtifact.create({
    data: {
      laudoId,
      type,
      fileName,
      filePath,
      sizeBytes: content.byteLength,
    },
  });
}

export function resolveStorageRoot(): string {
  return STORAGE_ROOT;
}
