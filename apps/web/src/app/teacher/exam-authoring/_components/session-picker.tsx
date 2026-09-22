'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ExamSessionListItem } from '@/lib/api/exam-session';

/** Trạng thái gắn đề được. Xem doc của `isAttachable`. */
const ATTACHABLE = new Set(['draft', 'scheduled']);

/**
 * Phiên nào gắn thêm đề được.
 *
 * `active` bị loại, và đây là quyết định chứ không phải thiếu sót: Security
 * rule 2 phát tài liệu cho agent ngay khi qua `start_time`, nên gắn thêm đề
 * vào phiên đang thi nghĩa là một nửa phòng nhận đề A, nửa kia nhận A+B.
 *
 * `collecting`/`completed`/`cancelled` thì đã xong, không còn gì để gắn.
 */
export function isAttachable(status: string): boolean {
  return ATTACHABLE.has(status);
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp',
  scheduled: 'Đã lên lịch',
  active: 'Đang diễn ra',
  collecting: 'Đang thu bài',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã huỷ',
};

const BLOCKED_REASON: Record<string, string> = {
  active: 'Đã phát tài liệu cho sinh viên — không gắn thêm đề được nữa',
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
          const attachable = isAttachable(s.status);
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
                aria-label={`${s.name} — ${STATUS_LABEL[s.status] ?? s.status}`}
              />
              <span className="flex-grow">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-small font-semibold text-foreground">{s.name}</span>
                  <Badge variant={attachable ? 'info' : 'default'}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </Badge>
                </span>
                <span className="mt-0.5 block text-caption text-muted-foreground">
                  {attachable ? when(s) : (BLOCKED_REASON[s.status] ?? when(s))}
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
