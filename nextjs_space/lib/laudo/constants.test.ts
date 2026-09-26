import { describe, it, expect } from 'vitest';
import { LAUDO_CREDIT_COST, hasEnoughCreditsForLaudo } from './constants';

describe('hasEnoughCreditsForLaudo', () => {
  it('returns false when the organization has fewer credits than the fixed cost', () => {
    expect(hasEnoughCreditsForLaudo(LAUDO_CREDIT_COST - 1)).toBe(false);
  });

  it('returns true when the organization has exactly the fixed cost', () => {
    expect(hasEnoughCreditsForLaudo(LAUDO_CREDIT_COST)).toBe(true);
  });

  it('returns true when the organization has more than the fixed cost', () => {
    expect(hasEnoughCreditsForLaudo(LAUDO_CREDIT_COST + 100)).toBe(true);
  });
});
