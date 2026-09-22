import jwt from 'jsonwebtoken';
import { Octokit } from '@octokit/rest';

const GITHUB_API = 'https://api.github.com';

function getPrivateKey(): string {
  const b64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
  if (!b64) {
    throw new Error('GITHUB_APP_PRIVATE_KEY_BASE64 environment variable is not set');
  }
  return Buffer.from(b64, 'base64').toString('utf-8');
}

export function generateAppJWT(): string {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) {
    throw new Error('GITHUB_APP_ID environment variable is not set');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    iat: nowSeconds - 60,
    exp: nowSeconds + 600,
    iss: appId,
  };

  return jwt.sign(payload, getPrivateKey(), { algorithm: 'RS256' });
}

interface CachedToken {
  token: string;
  expiresAt: Date;
}

const tokenCache = new Map<string, CachedToken>();
const EXPIRY_BUFFER_MS = 2 * 60 * 1000;

export async function getInstallationToken(installationId: bigint): Promise<string> {
  const cacheKey = installationId.toString();
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS) {
    return cached.token;
  }

  const appJwt = generateAppJWT();
  const response = await fetch(
    `${GITHUB_API}/app/installations/${cacheKey}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to create installation token (${response.status}): ${text}`
    );
  }

  const data = (await response.json()) as { token: string; expires_at: string };

  tokenCache.set(cacheKey, {
    token: data.token,
    expiresAt: new Date(data.expires_at),
  });

  return data.token;
}

export async function getOctokitForInstallation(
  installationId: bigint
): Promise<Octokit> {
  const token = await getInstallationToken(installationId);
  return new Octokit({ auth: token });
}
