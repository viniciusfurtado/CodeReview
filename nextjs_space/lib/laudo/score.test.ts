import { describe, it, expect } from 'vitest';
import { computeLaudoScore, shouldChargeForLaudo, EMPTY_REPOSITORY_SUMMARY } from './score';

describe('computeLaudoScore', () => {
  it('returns letter A and number 100 when there are no findings', () => {
    expect(computeLaudoScore([])).toEqual({ letter: 'A', number: 100 });
  });

  it('deducts more for ERROR than WARNING and none for INFO', () => {
    const infoOnly = computeLaudoScore([{ severity: 'INFO' }, { severity: 'INFO' }]);
    const warningOnly = computeLaudoScore([{ severity: 'WARNING' }]);
    const errorOnly = computeLaudoScore([{ severity: 'ERROR' }]);
    expect(infoOnly.number).toBe(100);
    expect(warningOnly.number).toBeLessThan(infoOnly.number);
    expect(errorOnly.number).toBeLessThan(warningOnly.number);
  });

  it('never goes below 0', () => {
    const manyErrors = Array.from({ length: 50 }, () => ({ severity: 'ERROR' as const }));
    expect(computeLaudoScore(manyErrors).number).toBe(0);
  });
});

describe('shouldChargeForLaudo', () => {
  it('is false when zero files were scanned', () => {
    expect(shouldChargeForLaudo(0)).toBe(false);
  });

  it('is true when at least one file was scanned', () => {
    expect(shouldChargeForLaudo(1)).toBe(true);
  });
});

describe('EMPTY_REPOSITORY_SUMMARY', () => {
  it('is a non-empty, user-facing message', () => {
    expect(EMPTY_REPOSITORY_SUMMARY.length).toBeGreaterThan(10);
  });
});
