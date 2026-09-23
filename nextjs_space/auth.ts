import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter, AdapterUser } from 'next-auth/adapters';
import { prisma } from '@/lib/db';
import { ensureDemoData } from '@/lib/demo';
import { ensureDefaultRules } from '@/lib/default-rules';

const GITHUB_API = 'https://api.github.com';

interface GithubProfileUser {
  id: string;
  githubId: string;
  githubLogin: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

interface GithubOrg {
  id: number;
  login: string;
  avatar_url: string;
  description: string | null;
}

function buildAdapter(): Adapter {
  const adapter = PrismaAdapter(prisma) as Adapter;

  adapter.createUser = async (data: AdapterUser): Promise<AdapterUser> => {
    const u = data as unknown as GithubProfileUser;
    const user = await prisma.user.upsert({
      where: { githubId: u.githubId },
      update: {
        githubLogin: u.githubLogin,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
      },
      create: {
        githubId: u.githubId,
        githubLogin: u.githubLogin,
        name: u.name ?? null,
        email: u.email ?? null,
        avatarUrl: u.avatarUrl ?? null,
      },
    });
    return { ...user, emailVerified: null } as unknown as AdapterUser;
  };

  return adapter;
}

async function ensureUser(user: GithubProfileUser): Promise<string> {
  const dbUser = await prisma.user.upsert({
    where: { githubId: user.githubId },
    update: {
      githubLogin: user.githubLogin,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    create: {
      githubId: user.githubId,
      githubLogin: user.githubLogin,
      name: user.name ?? null,
      email: user.email ?? null,
      avatarUrl: user.avatarUrl ?? null,
    },
  });
  return dbUser.id;
}

async function upsertOrgMembership(params: {
  userId: string;
  githubOrgId: string;
  githubLogin: string;
  name: string | null;
  avatarUrl: string | null;
  isPersonal: boolean;
}): Promise<void> {
  const org = await prisma.organization.upsert({
    where: { githubOrgId: params.githubOrgId },
    update: {
      githubLogin: params.githubLogin,
      name: params.name,
      avatarUrl: params.avatarUrl,
      isPersonal: params.isPersonal,
    },
    create: {
      githubOrgId: params.githubOrgId,
      githubLogin: params.githubLogin,
      name: params.name,
      avatarUrl: params.avatarUrl,
      isPersonal: params.isPersonal,
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      userId_organizationId: {
        userId: params.userId,
        organizationId: org.id,
      },
    },
    update: {},
    create: {
      userId: params.userId,
      organizationId: org.id,
      role: 'OWNER',
    },
  });

  await ensureDefaultRules(org.id);
}

async function syncUserOrganizations(
  user: GithubProfileUser,
  accessToken: string | undefined
): Promise<void> {
  const userId = await ensureUser(user);

  await upsertOrgMembership({
    userId,
    githubOrgId: user.githubId,
    githubLogin: user.githubLogin,
    name: user.name ?? user.githubLogin,
    avatarUrl: user.avatarUrl,
    isPersonal: true,
  });

  if (!accessToken) return;

  const res = await fetch(`${GITHUB_API}/user/orgs`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    console.error(`[auth] Failed to fetch GitHub orgs (${res.status})`);
    return;
  }

  const orgs = (await res.json()) as GithubOrg[];
  for (const org of orgs) {
    await upsertOrgMembership({
      userId,
      githubOrgId: String(org.id),
      githubLogin: org.login,
      name: org.description ?? org.login,
      avatarUrl: org.avatar_url,
      isPersonal: false,
    });
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: buildAdapter(),
  session: {
    strategy: 'jwt',
  },
  trustHost: true,
  providers: [
    Credentials({
      id: 'demo',
      name: 'Demo',
      credentials: {},
      async authorize() {
        const u = await ensureDemoData();
        return { id: u.id, name: u.name, email: u.email, image: u.image };
      },
    }),
    GitHub({
      clientId: process.env.GITHUB_APP_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET as string,
      authorization: {
        params: { scope: 'read:user user:email read:org' },
      },
      async profile(profile: any, tokens: any): Promise<GithubProfileUser> {
        // A API do GitHub só retorna profile.email quando o usuário tem um
        // e-mail público. Para a maioria dos usuários (e-mail privado) é
        // preciso buscar separadamente em /user/emails.
        let email: string | null = profile.email ?? null;
        if (!email && tokens?.access_token) {
          try {
            const res = await fetch('https://api.github.com/user/emails', {
              headers: {
                Authorization: `Bearer ${tokens.access_token}`,
                Accept: 'application/vnd.github+json',
              },
            });
            if (res.ok) {
              const emails = (await res.json()) as {
                email: string;
                primary: boolean;
                verified: boolean;
              }[];
              const chosen =
                emails.find((e) => e.primary && e.verified) ??
                emails.find((e) => e.verified) ??
                emails[0];
              email = chosen?.email ?? null;
            }
          } catch {
            // Best-effort — segue sem e-mail se a chamada falhar.
          }
        }

        return {
          id: String(profile.id),
          githubId: String(profile.id),
          githubLogin: profile.login,
          name: profile.name ?? null,
          email,
          avatarUrl: profile.avatar_url ?? null,
        };
      },
    }),
  ],
  pages: {
    signIn: '/',
  },
  callbacks: {
    async signIn({ user, account }: any) {
      // O modo demo já popula seus próprios dados em authorize().
      if (account?.provider === 'demo') {
        return true;
      }
      try {
        await syncUserOrganizations(
          user as unknown as GithubProfileUser,
          account?.access_token ?? account?.accessToken
        );
      } catch (error: any) {
        console.error('[auth] signIn org sync error:', error);
      }
      return true;
    },
    async jwt({ token, user }: any) {
      if (user) {
        token.userId = user.id;
        token.githubLogin = user.githubLogin ?? null;
      }
      if (token.userId && !token.primaryOrgId) {
        const membership = await prisma.organizationMember.findFirst({
          where: { userId: token.userId as string },
          orderBy: { createdAt: 'asc' },
          select: { organizationId: true },
        });
        token.primaryOrgId = membership?.organizationId ?? null;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.userId = (token.userId as string) ?? null;
        session.user.primaryOrgId = (token.primaryOrgId as string) ?? null;
        session.user.githubLogin = (token.githubLogin as string) ?? null;
      }
      return session;
    },
  },
});
