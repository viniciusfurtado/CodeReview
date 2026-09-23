'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 6000;

export const ACTIVE_REVIEW_STATUSES = ['PENDING', 'IN_PROGRESS'];

/**
 * Atualiza a página automaticamente enquanto houver alguma review em
 * processamento (PENDING/IN_PROGRESS), sem exigir refresh manual. Para
 * sozinho quando `active` vira false — o dado vem do server component a
 * cada refresh, então o polling se encerra assim que tudo chegar a um
 * status final (COMPLETED/FAILED).
 */
export function ReviewAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, router]);

  return null;
}
