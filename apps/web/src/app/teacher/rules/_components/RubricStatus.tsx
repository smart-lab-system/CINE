import { Check, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { statusOf } from '@/lib/rubric-board';

/** Tình trạng một rubric: biểu tượng + chữ (không truyền tin chỉ bằng màu — spec UI §2.1 luật 1). */
export function RubricStatus({ overview, className }: { overview: RubricOverview; className?: string }) {
  const { status, label } = statusOf(overview);
  const Icon = status === 'ready' ? Check : status === 'todo' ? TriangleAlert : Info;
  const tone = status === 'ready' ? 'text-success-strong' : status === 'todo' ? 'text-warning-strong' : 'text-primary';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-small font-semibold', tone, className)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
