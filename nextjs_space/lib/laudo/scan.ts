import { readdir, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ALLOWED_EXTENSIONS,
  IGNORED_DIR_NAMES,
  IGNORED_FILE_NAMES,
  MAX_FILE_BYTES,
  MAX_FILES_TOTAL,
  MAX_REPO_TOTAL_BYTES,
  BATCH_MAX_FILES,
} from './constants';

export interface ScannedFile {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
}

export interface ScanResult {
  files: ScannedFile[];
  filesSkipped: number;
  truncated: boolean;
}

export interface ScanOptions {
  /** Overrides MAX_FILES_TOTAL — production never passes this; tests use it to avoid creating hundreds of files. */
  maxFiles?: number;
  /** Overrides MAX_REPO_TOTAL_BYTES — production never passes this; tests use it to avoid writing gigabytes of data. */
  maxTotalBytes?: number;
}

/**
 * Percorre o diretório clonado coletando apenas arquivos de código-fonte
 * relevantes, com limites de tamanho e segurança. NUNCA segue links
 * simbólicos — um repositório malicioso poderia usar um link para apontar
 * para fora do diretório clonado (ex.: /etc/passwd).
 */
export async function scanRepository(rootDir: string, options: ScanOptions = {}): Promise<ScanResult> {
  const maxFiles = options.maxFiles ?? MAX_FILES_TOTAL;
  const maxTotalBytes = options.maxTotalBytes ?? MAX_REPO_TOTAL_BYTES;
  const files: ScannedFile[] = [];
  let filesSkipped = 0;
  let totalBytes = 0;
  let truncated = false;

  async function walk(dir: string): Promise<void> {
    if (truncated) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    // Ordem determinística: a mesma árvore sempre produz a mesma seleção.
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (truncated) return;

      if (entry.isSymbolicLink()) {
        filesSkipped++;
        continue;
      }

      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(full);
        continue;
      }

      if (!entry.isFile()) continue;

      if (IGNORED_FILE_NAMES.has(entry.name)) {
        filesSkipped++;
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        filesSkipped++;
        continue;
      }

      const stats = await lstat(full);
      if (stats.size > MAX_FILE_BYTES) {
        filesSkipped++;
        continue;
      }
      if (totalBytes + stats.size > maxTotalBytes || files.length >= maxFiles) {
        truncated = true;
        return;
      }

      totalBytes += stats.size;
      files.push({
        relativePath: path.relative(rootDir, full),
        absolutePath: full,
        sizeBytes: stats.size,
      });
    }
  }

  await walk(rootDir);
  return { files, filesSkipped, truncated };
}

export function groupIntoBatches(
  files: ScannedFile[],
  maxFilesPerBatch: number = BATCH_MAX_FILES
): ScannedFile[][] {
  const batches: ScannedFile[][] = [];
  for (let i = 0; i < files.length; i += maxFilesPerBatch) {
    batches.push(files.slice(i, i + maxFilesPerBatch));
  }
  return batches;
}

const MAX_FILE_CHARS = 20_000;

export async function readBatchContents(
  batch: ScannedFile[]
): Promise<{ relativePath: string; content: string }[]> {
  const results: { relativePath: string; content: string }[] = [];
  for (const file of batch) {
    let content: string;
    try {
      content = await readFile(file.absolutePath, 'utf8');
    } catch {
      continue; // arquivo binário ou ilegível — ignora silenciosamente
    }
    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS) + '\n... (arquivo truncado)';
    }
    results.push({ relativePath: file.relativePath, content });
  }
  return results;
}
