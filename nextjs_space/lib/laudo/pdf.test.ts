import { describe, it, expect } from 'vitest';
import { generateLaudoPdf } from './pdf';

const baseLaudo: any = {
  source: 'PUBLIC_URL',
  publicRepoUrl: 'https://github.com/owner/repo',
  branch: 'main',
  completedAt: new Date('2026-01-01T00:00:00Z'),
  organization: { name: 'Acme', githubLogin: 'acme' },
  summary: 'Tudo certo.',
  scoreLetter: 'A',
  scoreNumber: 95,
  filesScanned: 10,
  filesSkipped: 2,
  truncated: false,
  repository: null,
};

describe('generateLaudoPdf', () => {
  it('produces a valid, non-empty PDF buffer', async () => {
    const buffer = await generateLaudoPdf(baseLaudo, []);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });

  it('does not throw with findings present', async () => {
    const findings: any[] = [
      {
        filePath: 'src/a.ts',
        line: 10,
        severity: 'ERROR',
        title: 'Bug crítico',
        message: 'Explica o problema',
        suggestion: 'Corrija assim',
        source: 'CONFIRMED_BOTH',
      },
    ];
    const buffer = await generateLaudoPdf(baseLaudo, findings);
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
