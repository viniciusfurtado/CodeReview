import type { Severity } from '@/lib/llm/types';
import { gradeForReview, type ReviewGrade } from '@/lib/review-grade';

export interface LaudoScore {
  letter: ReviewGrade;
  number: number;
}

const SEVERITY_PENALTY: Record<Severity, number> = {
  ERROR: 8,
  WARNING: 3,
  INFO: 0,
};

/**
 * Nota numérica determinística (0-100): parte de 100 e desconta por
 * apontamento conforme a severidade, com piso em 0. A letra reaproveita
 * `gradeForReview` para manter consistência visual com as Revisões de PR.
 */
export function computeLaudoScore(findings: { severity: Severity }[]): LaudoScore {
  const errorCount = findings.filter((f) => f.severity === 'ERROR').length;
  const warningCount = findings.filter((f) => f.severity === 'WARNING').length;

  const penalty = findings.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
  const number = Math.max(0, Math.min(100, 100 - penalty));
  const letter = gradeForReview({ errorCount, warningCount });

  return { letter, number };
}

/**
 * Um Laudo só é cobrado quando análise real aconteceu. Um repositório sem
 * nenhum arquivo elegível não deve custar créditos ao usuário.
 */
export function shouldChargeForLaudo(filesScanned: number): boolean {
  return filesScanned > 0;
}

export const EMPTY_REPOSITORY_SUMMARY =
  'Nenhum arquivo de código-fonte reconhecido foi encontrado neste repositório/branch para análise.';
