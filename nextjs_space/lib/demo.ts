import { prisma } from '@/lib/db';

/**
 * Dados de demonstração ("modo demo").
 *
 * Popula o banco com um usuário fictício, uma organização com o GitHub App
 * "instalado" (installationId simulado) e alguns repositórios de exemplo, além
 * de uma organização pessoal sem instalação. Serve apenas para permitir a
 * navegação e validação da UI sem um GitHub App real configurado.
 *
 * Idempotente: pode ser chamado várias vezes sem duplicar registros.
 */

export const DEMO_GITHUB_ID = 'demo-user';
export const DEMO_EMAIL = 'demo@ai-code-review.dev';
export const DEMO_NAME = 'Usuário Demo';
export const DEMO_AVATAR =
  'https://avatars.githubusercontent.com/u/9919?s=200&v=4';

// installationId simulado para a org demo (BigInt, deve ser único).
const DEMO_INSTALLATION_ID = BigInt(900000001);

// Diff de exemplo usado no modo demo para permitir executar a análise de IA
// (ou o fallback mock) numa PR de demonstração de ponta a ponta.
export const SAMPLE_DIFF = `diff --git a/src/cache/gateway-cache.ts b/src/cache/gateway-cache.ts
index 3f1a2b4..9c8d7e6 100644
--- a/src/cache/gateway-cache.ts
+++ b/src/cache/gateway-cache.ts
@@ -1,12 +1,34 @@
-import Redis from 'ioredis';
+import Redis from 'ioredis';
+
+const REDIS_URL = 'redis://admin:senha123@10.0.0.5:6379';
 
 export class GatewayCache {
-  private client: Redis;
+  private client: Redis;
+  private ttl = 60;
 
   constructor() {
-    this.client = new Redis(process.env.REDIS_URL);
+    this.client = new Redis(REDIS_URL);
   }
 
-  async get(key: string) {
-    return this.client.get(key);
+  async get(key: string) {
+    const raw = await this.client.get(key);
+    return JSON.parse(raw);
   }
 
-  async set(key: string, value: string) {
-    await this.client.set(key, value);
+  async set(key: string, value: any) {
+    await this.client.set(key, JSON.stringify(value), 'EX', this.ttl);
+  }
+
+  async getOrLoad(key: string, loader: () => Promise<any>) {
+    let v = await this.get(key);
+    if (v == null) {
+      v = await loader();
+      this.set(key, v);
+    }
+    return v;
   }
 }
`;

interface DemoRepo {
  githubRepoId: bigint;
  fullName: string;
  name: string;
  private: boolean;
  isActive: boolean;
  defaultBranch: string;
}

const DEMO_ORG_REPOS: DemoRepo[] = [
  {
    githubRepoId: BigInt(910000001),
    fullName: 'acme-tech/api-gateway',
    name: 'api-gateway',
    private: true,
    isActive: true,
    defaultBranch: 'main',
  },
  {
    githubRepoId: BigInt(910000002),
    fullName: 'acme-tech/web-dashboard',
    name: 'web-dashboard',
    private: true,
    isActive: true,
    defaultBranch: 'main',
  },
  {
    githubRepoId: BigInt(910000003),
    fullName: 'acme-tech/mobile-app',
    name: 'mobile-app',
    private: false,
    isActive: false,
    defaultBranch: 'develop',
  },
  {
    githubRepoId: BigInt(910000004),
    fullName: 'acme-tech/design-system',
    name: 'design-system',
    private: false,
    isActive: true,
    defaultBranch: 'main',
  },
];

async function upsertMembership(
  userId: string,
  organizationId: string
): Promise<void> {
  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    update: {},
    create: { userId, organizationId, role: 'OWNER' },
  });
}

/**
 * Garante que o usuário demo e todos os dados de exemplo existam.
 * Retorna o id (cuid) do usuário demo no banco.
 */
export async function ensureDemoData(): Promise<{
  id: string;
  name: string;
  email: string;
  image: string;
}> {
  // 1. Usuário demo
  const user = await prisma.user.upsert({
    where: { githubId: DEMO_GITHUB_ID },
    update: {
      githubLogin: 'usuario-demo',
      name: DEMO_NAME,
      email: DEMO_EMAIL,
      avatarUrl: DEMO_AVATAR,
    },
    create: {
      githubId: DEMO_GITHUB_ID,
      githubLogin: 'usuario-demo',
      name: DEMO_NAME,
      email: DEMO_EMAIL,
      avatarUrl: DEMO_AVATAR,
    },
  });

  // 2. Organização com App "instalado"
  const org = await prisma.organization.upsert({
    where: { githubOrgId: 'demo-org-acme' },
    update: {
      githubLogin: 'acme-tech',
      name: 'ACME Technologies',
      avatarUrl: 'https://avatars.githubusercontent.com/u/583231?s=200&v=4',
      installationId: DEMO_INSTALLATION_ID,
      installationSuspended: false,
      isPersonal: false,
    },
    create: {
      githubOrgId: 'demo-org-acme',
      githubLogin: 'acme-tech',
      name: 'ACME Technologies',
      avatarUrl: 'https://avatars.githubusercontent.com/u/583231?s=200&v=4',
      installationId: DEMO_INSTALLATION_ID,
      installationSuspended: false,
      isPersonal: false,
    },
  });
  await upsertMembership(user.id, org.id);

  // 3. Repositórios de exemplo na org instalada
  for (const repo of DEMO_ORG_REPOS) {
    await prisma.repository.upsert({
      where: { githubRepoId: repo.githubRepoId },
      update: {
        organizationId: org.id,
        fullName: repo.fullName,
        name: repo.name,
        private: repo.private,
        isActive: repo.isActive,
        defaultBranch: repo.defaultBranch,
      },
      create: {
        githubRepoId: repo.githubRepoId,
        organizationId: org.id,
        fullName: repo.fullName,
        name: repo.name,
        private: repo.private,
        isActive: repo.isActive,
        defaultBranch: repo.defaultBranch,
      },
    });
  }

  // 3b. Regras de revisão de exemplo (apenas se ainda não existirem)
  const existingRules = await prisma.reviewRule.count({
    where: { organizationId: org.id },
  });
  if (existingRules === 0) {
    await prisma.reviewRule.createMany({
      data: [
        {
          organizationId: org.id,
          name: 'Segurança e credenciais',
          description:
            'Detecta segredos, chaves de API e senhas expostas no código.',
          instruction:
            'Analise o diff em busca de credenciais, tokens, chaves de API ou senhas em texto plano. Sinalize qualquer segredo exposto como ERROR e sugira uso de variáveis de ambiente.',
          severity: 'ERROR',
          enabled: true,
          appliesToAll: true,
        },
        {
          organizationId: org.id,
          name: 'Boas práticas de código',
          description:
            'Verifica legibilidade, nomes claros e funções pequenas.',
          instruction:
            'Avalie clareza dos nomes, tamanho das funções e duplicação de código. Sugira refatorações quando funções ultrapassarem responsabilidades únicas.',
          severity: 'WARNING',
          enabled: true,
          appliesToAll: true,
        },
        {
          organizationId: org.id,
          name: 'Cobertura de testes',
          description:
            'Alerta quando mudanças de lógica não incluem testes.',
          instruction:
            'Se o PR altera lógica de negócio sem adicionar ou atualizar testes automatizados, gere um aviso recomendando cobertura de testes.',
          severity: 'WARNING',
          enabled: false,
          appliesToAll: true,
        },
        {
          organizationId: org.id,
          name: 'Padrão de commits e documentação',
          description: 'Confere descrição do PR e comentários em APIs públicas.',
          instruction:
            'Verifique se funções e endpoints públicos possuem documentação. Sinalize como INFO quando faltar descrição no PR.',
          severity: 'INFO',
          enabled: true,
          appliesToAll: true,
        },
      ],
    });
  }

  // 3c. Canais de notificação de exemplo
  const existingChannels = await prisma.notificationChannel.count({
    where: { organizationId: org.id },
  });
  if (existingChannels === 0) {
    await prisma.notificationChannel.createMany({
      data: [
        {
          organizationId: org.id,
          type: 'EMAIL',
          label: 'E-mail da equipe',
          target: 'dev-team@acme-tech.com',
          enabled: true,
        },
        {
          organizationId: org.id,
          type: 'SLACK',
          label: 'Canal #code-review',
          target: 'https://hooks.slack.com/services/T000/B000/xxxx',
          enabled: true,
        },
        {
          organizationId: org.id,
          type: 'DISCORD',
          label: 'Servidor de Engenharia',
          target: 'https://discord.com/api/webhooks/000/xxxx',
          enabled: false,
        },
      ],
    });
  }

  // 3d. Revisões de PR de exemplo (com achados)
  const apiRepo = await prisma.repository.findUnique({
    where: { githubRepoId: BigInt(910000001) },
  });
  const webRepo = await prisma.repository.findUnique({
    where: { githubRepoId: BigInt(910000002) },
  });

  if (apiRepo) {
    const apiReviews = await prisma.pullRequestReview.count({
      where: { repositoryId: apiRepo.id },
    });
    if (apiReviews === 0) {
      await prisma.pullRequestReview.create({
        data: {
          repositoryId: apiRepo.id,
          prNumber: 142,
          prTitle: 'Adiciona autenticação por token JWT',
          author: 'mariana-dev',
          authorAvatar:
            'https://avatars.githubusercontent.com/u/1024025?s=80&v=4',
          branch: 'feat/jwt-auth',
          status: 'COMPLETED',
          summary:
            'A implementação está sólida, mas encontramos um segredo exposto e uma função muito extensa. Recomendamos ajustes antes do merge.',
          findings: {
            create: [
              {
                filePath: 'src/auth/jwt.ts',
                line: 27,
                severity: 'ERROR',
                title: 'Chave secreta em texto plano',
                message:
                  'A chave usada para assinar o token está fixa no código. Isso expõe um segredo sensível no repositório.',
                suggestion:
                  'Mova a chave para uma variável de ambiente (process.env.JWT_SECRET) e nunca a versione.',
              },
              {
                filePath: 'src/auth/handlers.ts',
                line: 88,
                severity: 'WARNING',
                title: 'Função com múltiplas responsabilidades',
                message:
                  'A função login() valida entrada, consulta o banco, gera token e formata resposta em um só bloco.',
                suggestion:
                  'Extraia a geração de token e a formatação da resposta em funções auxiliares.',
              },
              {
                filePath: 'src/auth/jwt.ts',
                line: 12,
                severity: 'INFO',
                title: 'Falta documentação',
                message:
                  'A função pública generateToken() não possui comentário descrevendo parâmetros e retorno.',
                suggestion: 'Adicione um bloco de documentação (JSDoc).',
              },
            ],
          },
        },
      });
      await prisma.pullRequestReview.create({
        data: {
          repositoryId: apiRepo.id,
          prNumber: 145,
          prTitle: 'Refatora camada de cache do gateway',
          author: 'joao-backend',
          authorAvatar:
            'https://avatars.githubusercontent.com/u/9919?s=80&v=4',
          branch: 'refactor/cache-layer',
          commitSha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
          diff: SAMPLE_DIFF,
          status: 'PENDING',
          summary: null,
        },
      });
    }
  }

  if (webRepo) {
    const webReviews = await prisma.pullRequestReview.count({
      where: { repositoryId: webRepo.id },
    });
    if (webReviews === 0) {
      await prisma.pullRequestReview.create({
        data: {
          repositoryId: webRepo.id,
          prNumber: 310,
          prTitle: 'Nova tela de configurações do usuário',
          author: 'carla-frontend',
          authorAvatar:
            'https://avatars.githubusercontent.com/u/583231?s=80&v=4',
          branch: 'feat/user-settings',
          status: 'COMPLETED',
          summary:
            'Bom trabalho! Nenhum problema crítico encontrado. Apenas uma sugestão de acessibilidade.',
          findings: {
            create: [
              {
                filePath: 'components/SettingsForm.tsx',
                line: 54,
                severity: 'INFO',
                title: 'Acessibilidade em campo de formulário',
                message:
                  'O campo de e-mail não possui um label associado, dificultando o uso por leitores de tela.',
                suggestion:
                  'Associe um <label htmlFor> ao input ou use aria-label.',
              },
            ],
          },
        },
      });
    }
  }

  // 3b. Backfill idempotente: garante que a PR de demonstração #145 possa ser
  // executada de ponta a ponta (bancos já populados não têm diff/status corretos).
  if (apiRepo) {
    await prisma.pullRequestReview.updateMany({
      where: {
        repositoryId: apiRepo.id,
        prNumber: 145,
        OR: [{ diff: null }, { status: 'IN_PROGRESS' }],
      },
      data: {
        diff: SAMPLE_DIFF,
        commitSha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
        status: 'PENDING',
      },
    });

    // PR dedicada, sempre disponível em estado PENDING para demonstrar o botão
    // "Executar análise" (upsert idempotente: não sobrescreve execuções feitas).
    await prisma.pullRequestReview.upsert({
      where: {
        repositoryId_prNumber: { repositoryId: apiRepo.id, prNumber: 150 },
      },
      update: {},
      create: {
        repositoryId: apiRepo.id,
        prNumber: 150,
        prTitle: 'Adiciona cache distribuído com invalidação por evento',
        author: 'mariana-dev',
        authorAvatar:
          'https://avatars.githubusercontent.com/u/1024025?s=80&v=4',
        branch: 'feat/distributed-cache',
        commitSha: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1',
        diff: SAMPLE_DIFF,
        status: 'PENDING',
        summary: null,
      },
    });
  }

  // 4. Organização pessoal SEM instalação (mostra o estado "Não Instalado")
  const personalOrg = await prisma.organization.upsert({
    where: { githubOrgId: 'demo-org-personal' },
    update: {
      githubLogin: 'usuario-demo',
      name: 'Usuário Demo',
      avatarUrl: DEMO_AVATAR,
      isPersonal: true,
    },
    create: {
      githubOrgId: 'demo-org-personal',
      githubLogin: 'usuario-demo',
      name: 'Usuário Demo',
      avatarUrl: DEMO_AVATAR,
      isPersonal: true,
    },
  });
  await upsertMembership(user.id, personalOrg.id);

  return {
    id: user.id,
    name: DEMO_NAME,
    email: DEMO_EMAIL,
    image: DEMO_AVATAR,
  };
}
