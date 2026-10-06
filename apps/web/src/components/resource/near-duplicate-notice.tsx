'use client';

import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { NearDuplicateError } from '@/lib/api/http-error';

interface NearDuplicateNoticeProps {
  error: NearDuplicateError;
  /** Danh từ trong nút xác nhận: "phòng", "mã lớp danh nghĩa". */
  noun: string;
  /**
   * Động từ trong nút xác nhận: "thêm" (mặc định) khi đang tạo mới, "lưu" khi đang SỬA TÊN một mục có sẵn — server cũng cảnh báo gần
   * giống lúc đổi tên, và "Vẫn thêm phòng này" khi đang đổi tên nói sai việc sắp làm.
   */
  action?: string;
  onConfirm: () => void;
  confirming: boolean;
}

/**
 * Lời nhắc khi nhập TAY một phòng hoặc một mã lớp danh nghĩa gần giống mục đã có (spec §2.2, §6.2 nguyên tắc 4): nêu các mục bị so rồi để
 * admin xác nhận gửi lại với `confirmSimilar: true`. Đây là lời nhắc, KHÔNG phải lệnh cấm — hệ thống không biết đó là cùng một thứ
 * hay hai thứ khác nhau (`A1`/`B1`, `ATT`/`CTT` đều là thật), nên hỏi chứ không quyết thay.
 *
 * Khác lỗi trùng CỨNG (409 thường, hiện ở `ResourceFormDialog` như mọi lỗi): trùng cứng chỉ sửa được, không có gì để xác nhận.
 * Component này đặt TRONG form, cạnh các ô nhập, để người dùng thấy lời nhắc trong khi vẫn thấy cái mình vừa gõ.
 */
export function NearDuplicateNotice({ error, noun, action = 'thêm', onConfirm, confirming }: NearDuplicateNoticeProps) {
  return (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertDescription className="flex flex-col gap-3">
        <span>{error.message}</span>
        {error.similar.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {error.similar.map((entry) => (
              <li key={entry.id} className="text-small font-medium">
                {entry.name}
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button type="button" size="sm" variant="outline" onClick={onConfirm} disabled={confirming}>
            Vẫn {action} {noun} này
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
