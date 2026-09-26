import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ALLOWED_GIT_HOSTS, CLONE_TIMEOUT_MS } from './constants';

const execFileAsync = promisify(execFile);

/**
 * Valida uma URL pública de repositório git ANTES de qualquer chamada de
 * rede: só HTTPS, só hosts conhecidos (comparação exata do hostname, nunca
 * "termina com" ou "contém" — evita smuggling tipo github.com.evil.com), sem
 * credenciais embutidas, e caminho no formato /owner/repo.
 */
export function isAllowedPublicGitUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  if (!ALLOWED_GIT_HOSTS.includes(host)) return false;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return false;

  return true;
}

export async function createTempCloneDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function removeDirSafely(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

interface CloneOptions {
  url: string;
  targetDir: string;
  branch?: string;
  timeoutMs?: number;
}

/** Clone raso (--depth 1) de um único branch, em diretório isolado. */
export async function cloneRepository(opts: CloneOptions): Promise<void> {
  const args = ['clone', '--depth', '1', '--single-branch'];
  if (opts.branch) args.push('--branch', opts.branch);
  args.push(opts.url, opts.targetDir);

  try {
    await execFileAsync('git', args, {
      timeout: opts.timeoutMs ?? CLONE_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error: any) {
    // Nunca vazar a URL autenticada (token de instalação) na mensagem de erro.
    const safeUrl = opts.url.replace(/:\/\/[^@]+@/, '://***@');
    throw new Error(`Falha ao clonar ${safeUrl}: ${error?.message ?? error}`);
  }
}

export function buildAuthenticatedCloneUrl(fullName: string, token: string): string {
  return `https://x-access-token:${token}@github.com/${fullName}.git`;
}
