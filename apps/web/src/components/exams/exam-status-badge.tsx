import { Badge } from '@/components/ui/badge';
import {
  EXAM_STATUS_LABELS,
  examStatusBadgeVariant,
} from './exam-status';
import type { ExamEventStatus } from './exam-types';

export function ExamStatusBadge({ status }: { status: ExamEventStatus }) {
  return (
    <Badge variant={examStatusBadgeVariant(status)}>
      {EXAM_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
