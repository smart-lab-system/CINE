'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ExamSessionListItem } from '@/lib/api/exam-session';
// Bảng nhãn DÙNG CHUNG với các màn phiên thi khác. Bản sao cục bộ trước đây
// trùng từng chữ với nó — hai bản sao là hai chỗ để cách gọi trạng thái lệch
// nhau giữa các màn.
import { EXAM_SESSION_STATUS_LABELS } from '@/lib/exam-session-display';

/** Trạng thái đã đóng — không còn gì để gắn vào. */
const CLOSED = new Set(['collecting', 'completed', 'cancelled']);

/**
 * Phiên nào gắn thêm đề được.
 *
 * Đo THỜI GIAN, không đọc `status`. Ranh giới thật là `startTime`: server
 * phát tài liệu cho agent ngay khi qua mốc đó (Security rule 2), nên gắn
 * thêm đề sau mốc ấy nghĩa là nửa phòng làm đề A, nửa kia làm A+B.
 *
 * Bản đầu viết `status ∈ {draft, scheduled}` và nó CHẶN SẠCH mọi phiên:
 * `ExamSessionService.create()` ghi thẳng `'active'` cho mọi phiên mới, không
 * dòng nào trong hệ thống từng mang hai trạng thái kia (đo trên DB dev:
 * 17.942 phiên, 0 dòng). Nút gắn đề khi ấy không bao giờ bấm được, và không
 * có thông báo nào nói vì sao.
 *
 * Luật thật nằm ở server (`AttachExamService.canAttachExam`); bản ở đây chỉ
 * để UI không mời người dùng bấm một thứ chắc chắn hỏng. Hai chỗ lệch nhau
 * thì server thắng — nó là chỗ duy nhất chặn được.
 */
export function isAttachable(
  session: Pick<ExamSessionListItem, 'status' | 'startTime'>,
  now: Date = new Date(),
): boolean {
  if (CLOSED.has(session.status)) {
    return false;
  }
  return now.getTime() < new Date(session.startTime).getTime();
}

/** Vì sao phiên này không gắn được — hiện ngay dưới tên phiên. */
export function blockedReason(session: Pick<ExamSessionListItem, 'status'>): string {
  if (CLOSED.has(session.status)) {
    return CLOSED_REASON[session.status] ?? 'Phiên đã đóng';
  }
  return 'Đã tới giờ thi — đã phát tài liệu cho sinh viên, không gắn thêm đề được nữa';
}

const CLOSED_REASON: Record<string, string> = {
  collecting: 'Đang thu bài — ca thi đã qua',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã huỷ',
};

function when(session: ExamSessionListItem): string {
  if (session.status === 'draft') {
    return 'Chưa chốt giờ · chưa chọn phòng';
  }
  const start = new Date(session.startTime);
  const d = String(start.getDate()).padStart(2, '0');
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const hh = String(start.getHours()).padStart(2, '0');
  const mm = String(start.getMinutes()).padStart(2, '0');
  return `${d}/${m} · ${hh}:${mm} · ${session.roomName} · ${session.className}`;
}

/**
 * Chọn phiên để gắn bộ ba vào.
 *
 * Phiên không gắn được vẫn HIỆN, xám mờ và kèm lý do — ẩn hẳn sẽ làm giảng
 * viên tưởng hệ thống quên mất phiên của họ, rồi đi tìm ở chỗ khác.
 */
export function SessionPicker({
  sessions,
  selectedId,
  onSelect,
  onCancel,
  onConfirm,
}: {
  sessions: ExamSessionListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-small leading-relaxed text-muted-foreground">
        Chỉ gắn được vào phiên <strong className="text-foreground">chưa bắt đầu</strong>. Phiên
        đang diễn ra không chọn được — tài liệu đã phát cho sinh viên rồi, thêm đề giữa chừng
        là hai đề trong một buổi.
      </p>

      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {sessions.length === 0 && (
          <p className="rounded-lg border border-border bg-surface-2 p-4 text-small text-muted-foreground">
            Bạn chưa có phiên thi nào. Tạo phiên trước, rồi quay lại gắn đề.
          </p>
        )}
        {sessions.map((s) => {
          const attachable = isAttachable(s);
          return (
            <label
              key={s.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                attachable
                  ? 'cursor-pointer border-border bg-surface hover:border-accent'
                  : 'cursor-not-allowed border-border bg-surface opacity-55',
                selectedId === s.id && 'border-accent-strong bg-accent-subtle',
              )}
            >
              <input
                type="radio"
                name="phien-thi"
                className="mt-1 accent-accent-strong"
                disabled={!attachable}
                checked={selectedId === s.id}
                onChange={() => onSelect(s.id)}
                aria-label={`${s.name} — ${EXAM_SESSION_STATUS_LABELS[s.status] ?? s.status}`}
              />
              <span className="flex-grow">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-small font-semibold text-foreground">{s.name}</span>
                  <Badge variant={attachable ? 'info' : 'default'}>
                    {EXAM_SESSION_STATUS_LABELS[s.status] ?? s.status}
                  </Badge>
                </span>
                <span className="mt-0.5 block text-caption text-muted-foreground">
                  {attachable ? when(s) : blockedReason(s)}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-surface-2 p-3 text-caption leading-relaxed text-muted-foreground">
        Sau khi xác nhận, bạn sẽ được đưa tới{' '}
        <strong className="text-foreground">phòng chờ của phiên</strong> để kiểm lại tài liệu.
        Việc gắn chỉ hoàn tất khi bạn xác nhận ở đó.
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="button" disabled={selectedId === null} onClick={onConfirm}>
          Tiếp tục
        </Button>
      </div>
    </div>
  );
}
