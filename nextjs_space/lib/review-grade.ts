// Nota lúdica calculada a partir dos apontamentos de uma review COMPLETED.
// Erros pesam muito mais que avisos; informativos não afetam a nota.
export type ReviewGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export function gradeForReview(counts: {
  errorCount: number;
  warningCount: number;
}): ReviewGrade {
  const { errorCount, warningCount } = counts;
  if (errorCount === 0 && warningCount === 0) return 'A';
  if (errorCount === 0 && warningCount <= 2) return 'B';
  if (errorCount === 0) return 'C';
  if (errorCount === 1) return 'C';
  if (errorCount === 2) return 'D';
  return 'F';
}

export function gradeColorClass(grade: ReviewGrade): string {
  switch (grade) {
    case 'A':
      return 'text-green-600 dark:text-green-400 border-green-600/30 bg-green-600/10';
    case 'B':
      return 'text-lime-600 dark:text-lime-400 border-lime-600/30 bg-lime-600/10';
    case 'C':
      return 'text-amber-600 dark:text-amber-400 border-amber-600/30 bg-amber-600/10';
    case 'D':
      return 'text-orange-600 dark:text-orange-400 border-orange-600/30 bg-orange-600/10';
    case 'F':
      return 'text-red-600 dark:text-red-400 border-red-600/30 bg-red-600/10';
  }
}
