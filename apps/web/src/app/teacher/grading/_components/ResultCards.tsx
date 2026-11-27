'use client';

import Link from 'next/link';
import { EyeOff } from 'lucide-react';
import { StatusPill } from '@/components/status-pill';
import { Badge } from '@/components/ui/badge';
import type { ResultRowView } from './result-row-view';

/**
 * Danh sách bài của phiên dạng thẻ cho viewport hẹp (dưới 820px, spec Giai đoạn 2 §5.1). Mỗi bài một thẻ: MSSV và tên,
 * trạng thái kèm điểm trên cùng một dòng, rồi số lỗi và lý do cần bạn. Chữ và điều kiện đọc từ `ResultRowView`, cùng
 * nguồn với bảng - đặc biệt, bài kiểm mẫu chưa nhận xét vẫn ẩn điểm ở đây. MSSV là liên kết duy nhất tới hồ sơ.
 */
export function ResultCards({ views, showMethodChip }: { views: ResultRowView[]; showMethodChip: boolean }) {
  return (
    <ul aria-label="Danh sách bài" className="divide-y divide-border overflow-clip rounded-lg border border-border bg-surface">
      {views.map((v) => {
        // "-" chỉ là chỗ giữ của cột trong bảng; ở thẻ, bỏ hẳn thay vì nối "- · -".
        const detail = [v.errors, v.reason].filter((text) => text !== '-').join(' · ');
        return (
          <li key={v.id} className="flex flex-col gap-1.5 px-3 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {/* Vùng bấm 40px: đệm 10px mỗi phía, kéo lề âm bù lại để thẻ không cao thêm. */}
              <Link href={v.href} className="-my-2.5 py-2.5 font-medium text-accent-strong hover:underline">
                {v.mssv}
              </Link>
              <span className="min-w-0 break-words">{v.name}</span>
              {v.makeup && <Badge variant="info">{v.makeup}</Badge>}
              {v.method === 'reading-code' ? (
                showMethodChip && <Badge variant="info">Chấm bằng đọc mã, không chạy</Badge>
              ) : (
                v.method === 'essay' && <Badge variant="outline">Bài tự luận</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <StatusPill status={v.status} ungradableReason={v.ungradableReason} pipeline={v.pipeline} />
              <span className="whitespace-nowrap">
                {v.auditHidden && <EyeOff className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                <span className="font-semibold tabular-nums">{v.score.text}</span>{' '}
                <span className="text-caption text-muted-foreground">{v.score.tag}</span>
              </span>
            </div>
            {detail !== '' && (
              <p title={detail} className="line-clamp-2 text-caption text-muted-foreground">
                {detail}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
