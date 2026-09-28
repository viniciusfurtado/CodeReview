// Constantes de negócio e de segurança do fluxo de Laudo. Mantidas em um só
// lugar para facilitar ajuste (ex.: mudar o custo em créditos) sem caçar
// números mágicos espalhados pelos módulos de clone/scan/queue.

export const LAUDO_CREDIT_COST = 5;

export function hasEnoughCreditsForLaudo(aiCredits: number): boolean {
  return aiCredits >= LAUDO_CREDIT_COST;
}

export const CLONE_TIMEOUT_MS = 120_000;
export const MAX_REPO_TOTAL_BYTES = 200 * 1024 * 1024; // 200MB
export const MAX_FILE_BYTES = 500 * 1024; // 500KB
export const MAX_FILES_TOTAL = 400;
export const BATCH_MAX_FILES = 8;

export const ALLOWED_GIT_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'];

export const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  'vendor',
  'coverage',
  '.turbo',
  '.cache',
  'target',
  '__pycache__',
  '.venv',
  'venv',
]);

export const IGNORED_FILE_NAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
  'poetry.lock',
  'Gemfile.lock',
]);

export const ALLOWED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.java',
  '.kt',
  '.kts',
  '.cs',
  '.php',
  '.rs',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.swift',
  '.scala',
  '.sql',
  '.sh',
  '.yml',
  '.yaml',
  '.json',
  '.css',
  '.scss',
  '.html',
  '.vue',
]);
