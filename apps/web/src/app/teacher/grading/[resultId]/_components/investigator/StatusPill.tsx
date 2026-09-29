import { CheckCircle2, CircleMinus, RefreshCw, Repeat, TriangleAlert } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';

/**
 * Bốn nhóm hiển thị (spec §4.4 — suy từ trạng thái, không có trường nào nói
 * thẳng): "Cần bạn xem" và "Không chấm được" đều là `flagged_for_review`,
 * phân biệt DUY NHẤT bằng `ungradableReason !== null`.
 */
export function StatusPill({
  status,
  ungradableReason,
}: {
  status: string;
  ungradableReason: string | null;
}) {
  if (status === 'flagged_for_review' && ungradableReason !== null) {
    return (
      <Badge variant="default" className="gap-1.5">
        <CircleMinus className="h-3 w-3" aria-hidden="true" />
        Không chấm được
      </Badge>
    );
  }
  const byStatus: Record<string, { label: string; variant: BadgeProps['variant']; icon: typeof CheckCircle2 }> = {
    flagged_for_review: { label: 'Cần bạn xem', variant: 'warning', icon: TriangleAlert },
    auto_approved: { label: 'Tự quyết', variant: 'success', icon: CheckCircle2 },
    audit_pending: { label: 'Kiểm mẫu', variant: 'primary', icon: Repeat },
    ai_grading: { label: 'Đang chấm', variant: 'default', icon: RefreshCw },
    ai_graded: { label: 'Đang chấm', variant: 'default', icon: RefreshCw },
    teacher_reviewed: { label: 'Đã duyệt', variant: 'accent', icon: CheckCircle2 },
    finalized: { label: 'Đã chốt', variant: 'primary', icon: CheckCircle2 },
    exported: { label: 'Đã chốt', variant: 'primary', icon: CheckCircle2 },
  };
  const entry = byStatus[status] ?? { label: status, variant: 'default' as const, icon: TriangleAlert };
  const Icon = entry.icon;
  return (
    <Badge variant={entry.variant} className="gap-1.5">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {entry.label}
    </Badge>
  );
}
