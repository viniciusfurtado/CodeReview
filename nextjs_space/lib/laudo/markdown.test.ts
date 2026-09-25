import { describe, it, expect } from 'vitest';
import { generateLaudoMarkdown } from './markdown';

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

describe('generateLaudoMarkdown', () => {
  it('includes repository, score, and summary', () => {
    const md = generateLaudoMarkdown(baseLaudo, []);
    expect(md).toContain('owner/repo');
    expect(md).toContain('A (95/100)');
    expect(md).toContain('Tudo certo.');
  });

  it('shows a friendly message when there are no findings', () => {
    const md = generateLaudoMarkdown(baseLaudo, []);
    expect(md).toContain('Nenhum apontamento');
  });

  it('renders each finding with file, severity, and suggestion', () => {
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
    const md = generateLaudoMarkdown(baseLaudo, findings);
    expect(md).toContain('Bug crítico');
    expect(md).toContain('src/a.ts:10');
    expect(md).toContain('Corrija assim');
    expect(md).toContain('Confirmado por 2 IAs');
  });

  it('shows "não aplicável" when there is no score', () => {
    const md = generateLaudoMarkdown({ ...baseLaudo, scoreLetter: null, scoreNumber: null }, []);
    expect(md).toContain('não aplicável');
  });
});
