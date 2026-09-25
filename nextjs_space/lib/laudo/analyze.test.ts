import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeBatch } from './analyze';

describe('analyzeBatch — no provider configured', () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.SERVICE_CLAUDE_BASE_URL;
    delete process.env.SERVICE_CLAUDE_API_KEY;
  });

  it('throws a clear error when neither the free tier nor Claude are configured', async () => {
    await expect(
      analyzeBatch([{ relativePath: 'a.ts', content: 'const a = 1;' }], [])
    ).rejects.toThrow(/Nenhum provedor de IA disponível/);
  });
});
