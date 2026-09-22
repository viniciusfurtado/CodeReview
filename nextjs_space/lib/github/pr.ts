import { getInstallationToken } from './auth';

const GITHUB_API = 'https://api.github.com';

/**
 * Busca o diff textual de um Pull Request usando o token da instalação.
 */
export async function fetchPrDiff(
  installationId: bigint,
  fullName: string,
  prNumber: number
): Promise<string> {
  const token = await getInstallationToken(installationId);
  const response = await fetch(
    `${GITHUB_API}/repos/${fullName}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3.diff',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Falha ao buscar diff do PR #${prNumber} (${response.status}): ${text}`
    );
  }

  return response.text();
}