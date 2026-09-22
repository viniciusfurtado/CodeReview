import { auth } from '@/auth';
import { prisma } from '@/lib/db';

/**
 * Retorna o id do usuário autenticado (sessão) ou null.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user?.userId as string | undefined) ?? null;
}

/**
 * Retorna os ids das organizações das quais o usuário é membro.
 */
export async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true },
  });
  return memberships.map((m) => m.organizationId);
}

/**
 * Verifica se o usuário pode acessar uma organização específica.
 */
export async function userCanAccessOrg(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const membership = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { id: true },
  });
  return Boolean(membership);
}
