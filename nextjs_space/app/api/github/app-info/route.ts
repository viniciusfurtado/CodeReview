import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const session = await auth();

  if (!session?.user?.userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const appName = process.env.GITHUB_APP_NAME ?? '';
  const installUrl = `https://github.com/apps/${appName}/installations/new`;

  return Response.json({ installUrl, appName });
}
