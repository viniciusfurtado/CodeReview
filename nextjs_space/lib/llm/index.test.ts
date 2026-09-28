import { describe, it, expect, beforeEach } from 'vitest';
import { runAnalysis } from './index';

describe('runAnalysis (mock fallback, no network)', () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.SERVICE_CLAUDE_BASE_URL;
    delete process.env.SERVICE_CLAUDE_API_KEY;
    delete process.env.SERVICE_AGY_BASE_URL;
    delete process.env.SERVICE_AGY_API_KEY;
  });

  it('falls back to the deterministic mock analysis when no provider is configured', async () => {
    const result = await runAnalysis({
      provider: 'OPENROUTER',
      hasCredits: false,
      prTitle: 'Test PR',
      diff: '+++ b/src/example.ts\n+const x = 1;',
      rules: [],
    });
    expect(result.usedMock).toBe(true);
    expect(result.billable).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
