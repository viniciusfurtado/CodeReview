import { describe, it, expect } from 'vitest';
import {
  buildLaudoBatchPrompt,
  buildFusionPrompt,
  parseFusionJson,
} from './prompt';

const files = [{ relativePath: 'src/a.ts', content: 'export const a = 1;' }];
const rules = [{ name: 'no-any', instruction: 'Evite o tipo any', severity: 'WARNING' as const }];

describe('buildLaudoBatchPrompt', () => {
  it('includes the file path, its content, and the formatted rule', () => {
    const prompt = buildLaudoBatchPrompt(files, rules);
    expect(prompt).toContain('src/a.ts');
    expect(prompt).toContain('export const a = 1;');
    expect(prompt).toContain('no-any');
    expect(prompt).toContain('Evite o tipo any');
  });

  it('explains there are no custom rules when the list is empty', () => {
    expect(buildLaudoBatchPrompt(files, [])).toContain('Nenhuma regra personalizada');
  });
});

describe('buildFusionPrompt', () => {
  it('lists the free-tier findings for the model to double-check', () => {
    const prompt = buildFusionPrompt(
      files,
      [{ filePath: 'src/a.ts', line: 1, severity: 'ERROR', title: 'Bug', message: 'Explica o bug' }],
      rules
    );
    expect(prompt).toContain('src/a.ts:1');
    expect(prompt).toContain('Bug');
    expect(prompt).toContain('Explica o bug');
  });

  it('says explicitly when there are no free-tier findings to fuse', () => {
    expect(buildFusionPrompt(files, [], rules)).toContain(
      'Nenhum apontamento foi gerado pela primeira IA'
    );
  });
});

describe('parseFusionJson', () => {
  it('parses confirmedByBoth per finding, defaulting to false', () => {
    const raw = JSON.stringify({
      summary: 'ok',
      findings: [
        { filePath: 'a.ts', severity: 'ERROR', title: 't1', message: 'm1', confirmedByBoth: true },
        { filePath: 'b.ts', severity: 'INFO', title: 't2', message: 'm2' },
      ],
    });
    const parsed = parseFusionJson(raw);
    expect(parsed.findings[0].confirmedByBoth).toBe(true);
    expect(parsed.findings[1].confirmedByBoth).toBe(false);
  });
});
