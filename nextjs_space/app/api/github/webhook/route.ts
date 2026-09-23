import { after } from 'next/server';
import { prisma } from '@/lib/db';
import { validateWebhookSignature } from '@/lib/github/webhook';
import { fetchPrDiff } from '@/lib/github/pr';
import { processReview } from '@/lib/queue';
import { ensureDefaultRules } from '@/lib/default-rules';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface GithubAccount {
  id: number;
  login: string;
  name?: string | null;
  avatar_url?: string;
}

interface GithubRepoRef {
  id: number;
  name: string;
  full_name: string;
  private?: boolean;
  default_branch?: string;
}

interface InstallationPayload {
  action: string;
  installation: {
    id: number;
    account: GithubAccount;
  };
  repositories?: GithubRepoRef[];
  repositories_added?: GithubRepoRef[];
  repositories_removed?: GithubRepoRef[];
}

async function upsertOrgFromInstallation(
  account: GithubAccount,
  installationId: bigint | null,
  installationSuspended: boolean
): Promise<string> {
  const org = await prisma.organization.upsert({
    where: { githubOrgId: String(account.id) },
    update: {
      githubLogin: account.login,
      name: account.name ?? account.login,
      avatarUrl: account.avatar_url ?? null,
      installationId,
      installationSuspended,
    },
    create: {
      githubOrgId: String(account.id),
      githubLogin: account.login,
      name: account.name ?? account.login,
      avatarUrl: account.avatar_url ?? null,
      installationId,
      installationSuspended,
    },
  });
  await ensureDefaultRules(org.id);
  return org.id;
}

async function upsertRepositories(
  organizationId: string,
  repos: GithubRepoRef[]
): Promise<void> {
  for (const repo of repos) {
    await prisma.repository.upsert({
      where: { githubRepoId: BigInt(repo.id) },
      update: {
        organizationId,
        fullName: repo.full_name,
        name: repo.name,
        private: repo.private ?? false,
        isActive: true,
        defaultBranch: repo.default_branch ?? 'main',
      },
      create: {
        githubRepoId: BigInt(repo.id),
        organizationId,
        fullName: repo.full_name,
        name: repo.name,
        private: repo.private ?? false,
        isActive: true,
        defaultBranch: repo.default_branch ?? 'main',
      },
    });
  }
}

interface PullRequestPayload {
  action: string;
  installation?: { id: number };
  repository: GithubRepoRef;
  pull_request: {
    number: number;
    title: string;
    user?: { login?: string; avatar_url?: string };
    head?: { ref?: string; sha?: string };
    merged?: boolean;
  };
}

const PR_ACTIONS = ['opened', 'synchronize', 'reopened', 'ready_for_review'];

/**
 * PR fechada (com ou sem merge): só atualiza o ciclo de vida da review já
 * existente — não dispara reanálise.
 */
async function handlePullRequestClosed(payload: PullRequestPayload): Promise<void> {
  const repo = await prisma.repository.findUnique({
    where: { githubRepoId: BigInt(payload.repository.id) },
  });
  if (!repo) return;

  await prisma.pullRequestReview
    .update({
      where: {
        repositoryId_prNumber: { repositoryId: repo.id, prNumber: payload.pull_request.number },
      },
      data: {
        prMerged: payload.pull_request.merged === true,
        prClosedAt: new Date(),
      },
    })
    .catch(() => {
      // Sem review registrada para essa PR (nunca chegou a ser analisada) — nada a atualizar.
    });
}

async function handlePullRequest(payload: PullRequestPayload): Promise<void> {
  if (payload.action === 'closed') {
    await handlePullRequestClosed(payload);
    return;
  }

  if (!PR_ACTIONS.includes(payload.action)) return;

  const repo = await prisma.repository.findUnique({
    where: { githubRepoId: BigInt(payload.repository.id) },
    include: { organization: true },
  });

  // Ignora repos desconhecidos ou com revisão desativada.
  if (!repo || !repo.isActive) return;

  const pr = payload.pull_request;
  const installationId = payload.installation
    ? BigInt(payload.installation.id)
    : repo.organization.installationId;

  // Busca o diff (best-effort; segue mesmo se falhar).
  let diff = '';
  if (installationId) {
    try {
      diff = await fetchPrDiff(installationId, repo.fullName, pr.number);
    } catch (error) {
      console.error('[webhook] falha ao buscar diff:', error);
    }
  }

  const review = await prisma.pullRequestReview.upsert({
    where: {
      repositoryId_prNumber: { repositoryId: repo.id, prNumber: pr.number },
    },
    update: {
      prTitle: pr.title,
      branch: pr.head?.ref ?? 'unknown',
      commitSha: pr.head?.sha ?? null,
      author: pr.user?.login ?? 'desconhecido',
      authorAvatar: pr.user?.avatar_url ?? null,
      diff,
      status: 'PENDING',
      queuedAt: new Date(),
      error: null,
      attempts: 0,
      prMerged: false,
      prClosedAt: null,
    },
    create: {
      repositoryId: repo.id,
      prNumber: pr.number,
      prTitle: pr.title,
      branch: pr.head?.ref ?? 'unknown',
      commitSha: pr.head?.sha ?? null,
      author: pr.user?.login ?? 'desconhecido',
      authorAvatar: pr.user?.avatar_url ?? null,
      diff,
      status: 'PENDING',
      queuedAt: new Date(),
    },
  });

  // Processa fora do ciclo de resposta do webhook (fila assíncrona).
  after(async () => {
    await processReview(review.id);
  });
}

async function handleInstallation(payload: InstallationPayload): Promise<void> {
  const { action, installation } = payload;
  const account = installation.account;
  const installationId = BigInt(installation.id);

  switch (action) {
    case 'created': {
      const orgId = await upsertOrgFromInstallation(account, installationId, false);
      if (payload.repositories?.length) {
        await upsertRepositories(orgId, payload.repositories);
      }
      break;
    }
    case 'deleted': {
      await prisma.organization.updateMany({
        where: { githubOrgId: String(account.id) },
        data: { installationId: null, installationSuspended: false },
      });
      break;
    }
    case 'suspend': {
      await prisma.organization.updateMany({
        where: { githubOrgId: String(account.id) },
        data: { installationSuspended: true },
      });
      break;
    }
    case 'unsuspend': {
      await prisma.organization.updateMany({
        where: { githubOrgId: String(account.id) },
        data: { installationSuspended: false },
      });
      break;
    }
    default:
      break;
  }
}

async function handleInstallationRepositories(
  payload: InstallationPayload
): Promise<void> {
  const { action, installation } = payload;
  const account = installation.account;
  const installationId = BigInt(installation.id);

  const orgId = await upsertOrgFromInstallation(account, installationId, false);

  if (action === 'added' && payload.repositories_added?.length) {
    await upsertRepositories(orgId, payload.repositories_added);
  } else if (action === 'removed' && payload.repositories_removed?.length) {
    const ids = payload.repositories_removed.map((r: GithubRepoRef) => BigInt(r.id));
    await prisma.repository.updateMany({
      where: { githubRepoId: { in: ids } },
      data: { isActive: false },
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  const event = request.headers.get('x-github-event');
  const deliveryId = request.headers.get('x-github-delivery');
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? '';

  if (!validateWebhookSignature(rawBody, signature, secret)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Idempotência: se esta entrega já foi registrada, não reprocessa.
  if (deliveryId) {
    try {
      await prisma.webhookEvent.create({
        data: { deliveryId, eventType: event ?? 'unknown' },
      });
    } catch {
      // Violação de unicidade => entrega repetida; responde OK sem reprocessar.
      return Response.json({ ok: true, duplicate: true }, { status: 200 });
    }
  }

  try {
    const payload = JSON.parse(rawBody);

    switch (event) {
      case 'pull_request':
        await handlePullRequest(payload as PullRequestPayload);
        break;
      case 'installation':
        await handleInstallation(payload as InstallationPayload);
        break;
      case 'installation_repositories':
        await handleInstallationRepositories(payload as InstallationPayload);
        break;
      default:
        break;
    }

    if (deliveryId) {
      await prisma.webhookEvent.update({
        where: { deliveryId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    }
  } catch (error: any) {
    console.error('[webhook] handler error:', error);
    if (deliveryId) {
      await prisma.webhookEvent
        .update({
          where: { deliveryId },
          data: { status: 'ERROR', error: String(error?.message ?? error) },
        })
        .catch(() => {});
    }
  }

  return Response.json({ ok: true }, { status: 200 });
}
