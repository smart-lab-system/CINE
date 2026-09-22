'use client';

import { AlertTriangle, Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExamSessionListItem } from '@/lib/api/exam-session';

/**
 * Cảnh báo trước khi gắn một bộ ba CHƯA KIỂM CHỨNG vào phiên thi.
 *
 * Nêu ĐÚNG hậu quả, không phải "bạn có chắc không?". Spec soạn đề §4.1: spec
 * chấm dựng toàn bộ cơ chế rút chuẩn trên đáp án mẫu, nên một đáp án sai làm
 * cả phiên bị đo bằng thước bịa — và hỏng im lặng, vì bài nào cũng "lệch
 * chuẩn" nên không có dấu hiệu nào chỉ về phía cái thước.
 *
 * Nút mặc định là HUỶ. "Vẫn gắn" là nút phụ, màu cảnh báo.
 */
export function UnverifiedWarning({
  session,
  onCancel,
  onProceed,
  pending,
}: {
  session: ExamSessionListItem;
  onCancel: () => void;
  onProceed: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-subtle">
          <AlertTriangle className="h-5 w-5 text-warning-strong" aria-hidden="true" />
        </span>
        <div className="text-small leading-relaxed text-foreground">
          <p className="text-body font-bold">Đáp án mẫu này chưa từng được chạy</p>
          <p className="mt-2">
            Hệ thống chấm điểm lấy đáp án mẫu làm{' '}
            <strong>chuẩn để so mọi bài nộp</strong> của phiên này.
          </p>
          <p className="mt-2">
            Nếu đáp án này sai hoặc không biên dịch được, cả phiên thi sẽ bị đo bằng một cái
            thước sai — và <strong>mọi bài đều sẽ trông như có lỗi</strong>, nên sẽ không có
            dấu hiệu nào cho thấy vấn đề nằm ở cái thước chứ không ở sinh viên.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-2 p-3.5">
        <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          Sẽ gắn vào phiên &ldquo;{session.name}&rdquo;
        </p>
        <ul className="flex flex-col gap-1.5 text-small">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-strong" aria-hidden="true" />
            <span>
              <strong>Đề thi</strong> — sinh viên tải được sau giờ bắt đầu.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-strong" aria-hidden="true" />
            <span>
              <strong>Đáp án mẫu</strong> — chỉ dùng để chấm, sinh viên không bao giờ tải được.
            </span>
          </li>
          <li className="flex items-start gap-2 text-muted-foreground">
            <Minus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>Gói test</strong> — chưa gắn được ở bản này; vẫn nằm trong file Word bạn
              đã xuất.
            </span>
          </li>
        </ul>
      </div>

      <p className="text-caption leading-relaxed text-muted-foreground">
        Phiên này sẽ được đánh dấu là{' '}
        <strong className="text-warning-strong">dùng chuẩn chưa kiểm chứng</strong>, và màn
        chấm điểm sẽ hiện cảnh báo trên mọi bài của phiên. Bấm tiếp sẽ đưa bạn tới phòng chờ
        để kiểm lại tài liệu.
      </p>

      <div className="flex items-center justify-end gap-2">
        {/* Nút mặc định là HUỶ, cố ý: hướng an toàn phải là hướng dễ bấm nhất. */}
        <Button type="button" onClick={onCancel} disabled={pending}>
          Huỷ
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onProceed}
          disabled={pending}
          className="border-destructive/40 text-destructive hover:bg-danger-subtle"
        >
          {pending ? 'Đang gắn…' : 'Vẫn gắn — tới phòng chờ'}
        </Button>
      </div>
    </div>
  );
}
