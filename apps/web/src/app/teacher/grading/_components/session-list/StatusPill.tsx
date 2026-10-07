import { CheckCircle2, CircleDashed, Lock, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LIST_STATUS_LABEL, type ListStatus } from '@/lib/session-list';

/** Biểu tượng và màu giống thanh tổng quan của trang kết quả (`OverviewBar`): một ngôn ngữ trạng thái. */
export const STATUS_PILL: Record<ListStatus, { variant: 'warning' | 'success' | 'default' | 'info' | 'primary'; Icon: LucideIcon }> = {
  attention: { variant: 'warning', Icon: TriangleAlert },
  ready: { variant: 'success', Icon: CheckCircle2 },
  todo: { variant: 'default', Icon: CircleDashed },
  running: { variant: 'info', Icon: RefreshCw },
  done: { variant: 'primary', Icon: Lock },
};

export function StatusPill({ status }: { status: ListStatus | null }) {
  if (status === null) return <span className="text-caption text-muted-foreground">—</span>;
  const { variant, Icon } = STATUS_PILL[status];
  return (
    <Badge variant={variant}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {LIST_STATUS_LABEL[status]}
    </Badge>
  );
}

