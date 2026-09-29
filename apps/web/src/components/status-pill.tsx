import { CheckCircle2, CircleMinus, Lock, RefreshCw, Repeat, TriangleAlert } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { STATE_LABEL, stateOf, type SessionState } from '@/lib/session-triage';

const STYLE: Record<SessionState, { variant: BadgeProps['variant']; icon: typeof CheckCircle2 }> = {
  needsYou: { variant: 'warning', icon: TriangleAlert },
  audit: { variant: 'primary', icon: Repeat },
  ungradable: { variant: 'default', icon: CircleMinus },
  grading: { variant: 'default', icon: RefreshCw },
  auto: { variant: 'success', icon: CheckCircle2 },
  reviewed: { variant: 'accent', icon: CheckCircle2 },
  finalised: { variant: 'primary', icon: Lock },
};

const KNOWN = new Set([
  'ai_grading',
  'ai_graded',
  'auto_approved',
  'audit_pending',
  'flagged_for_review',
  'teacher_reviewed',
  'finalized',
  'exported',
]);

/**
 * Nhãn trạng thái của một bài — biểu tượng + chữ, không bao giờ chỉ màu (spec §2.1 luật 1). Nhãn lấy từ
 * `STATE_LABEL` của `session-triage` — MỘT nơi định nghĩa, để danh sách, hồ sơ và file CSV cùng nói một từ.
 *
 * Bài TỰ LUẬN không bao giờ mang nhãn của một quyết định máy (§3.11, T-UI-20): còn sót `auto_approved` từ
 * trước khi đổi chính sách thì gọi đúng tên nó — "tự duyệt theo chính sách cũ".
 *
 * Status lạ thì hiện nguyên tên, không nổ và không im lặng.
 */
export function StatusPill({
  status,
  ungradableReason,
  pipeline,
}: {
  status: string;
  ungradableReason: string | null;
  pipeline?: 'one_shot' | 'investigator';
}) {
  const state = stateOf({ status, ungradableReason });
  const style = STYLE[state];
  const Icon = KNOWN.has(status) ? style.icon : TriangleAlert;
  const legacyEssay = pipeline === 'one_shot' && state === 'auto';
  const label = !KNOWN.has(status) ? status : legacyEssay ? 'Tự duyệt theo chính sách cũ' : STATE_LABEL[state];
  return (
    <Badge variant={legacyEssay ? 'default' : style.variant} className="gap-1.5">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}
