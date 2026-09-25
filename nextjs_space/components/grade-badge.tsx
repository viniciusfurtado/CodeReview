import { gradeColorClass, type ReviewGrade } from '@/lib/review-grade';
import { cn } from '@/lib/utils';

export function GradeBadge({ grade, className }: { grade: ReviewGrade; className?: string }) {
  return (
    <span
      title={`Nota da revisão: ${grade}`}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
        gradeColorClass(grade),
        className
      )}
    >
      {grade}
    </span>
  );
}
