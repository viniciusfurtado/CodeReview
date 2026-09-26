import { describe, it, expect } from 'vitest';
import { isAllowedPublicGitUrl, buildAuthenticatedCloneUrl } from './git';

describe('isAllowedPublicGitUrl', () => {
  it('accepts a plain https GitHub repo URL', () => {
    expect(isAllowedPublicGitUrl('https://github.com/octocat/Hello-World')).toBe(true);
  });

  it('accepts GitLab and Bitbucket hosts', () => {
    expect(isAllowedPublicGitUrl('https://gitlab.com/owner/repo')).toBe(true);
    expect(isAllowedPublicGitUrl('https://bitbucket.org/owner/repo')).toBe(true);
  });

  it('rejects a non-allowlisted host', () => {
    expect(isAllowedPublicGitUrl('https://example.com/owner/repo')).toBe(false);
  });

  it('rejects a host that merely contains an allowed name (subdomain smuggling)', () => {
    expect(isAllowedPublicGitUrl('https://github.com.evil.com/owner/repo')).toBe(false);
  });

  it('rejects plain http (non-HTTPS)', () => {
    expect(isAllowedPublicGitUrl('http://github.com/owner/repo')).toBe(false);
  });

  it('rejects a URL with embedded credentials', () => {
    expect(isAllowedPublicGitUrl('https://user:pass@github.com/owner/repo')).toBe(false);
  });

  it('rejects a URL pointing at a private/internal address disguised as a path', () => {
    expect(isAllowedPublicGitUrl('https://github.com')).toBe(false);
  });

  it('rejects a malformed URL', () => {
    expect(isAllowedPublicGitUrl('not-a-url')).toBe(false);
  });
});

describe('buildAuthenticatedCloneUrl', () => {
  it('embeds the installation token as x-access-token basic auth', () => {
    expect(buildAuthenticatedCloneUrl('owner/repo', 'tok123')).toBe(
      'https://x-access-token:tok123@github.com/owner/repo.git'
    );
  });
});
