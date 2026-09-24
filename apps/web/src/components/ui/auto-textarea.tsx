import * as React from 'react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Textarea tự cao theo nội dung.
 *
 * Các textarea ở trang soạn đề từng đứng im ở số dòng cố định: nhập yêu cầu
 * dài hay đáp án dài thì chữ cuộn trong hộp, trang trông như không phản ứng
 * với độ dài. Hộp này tự giãn theo `scrollHeight` mỗi khi `value` đổi — kể cả
 * khi nội dung đến sau mount (khôi phục bản nháp), vì effect nghe chính
 * `value`.
 *
 * `rows` của người gọi vẫn là chiều cao tối thiểu; `max-h-[55vh]` chặn hộp
 * không phình vô hạn. Bỏ `resize` thủ công (`resize-none`): chiều cao giờ do
 * nội dung quyết định, tay cầm kéo chỉ còn là hai thước đo tranh nhau.
 */
const AutoTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const setRefs = (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    };

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      // `auto` trước rồi mới đặt `scrollHeight`: xoá chữ thì `scrollHeight`
      // mới phải co lại, nếu không hộp chỉ cao thêm chứ không hạ xuống.
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }, [props.value]);

    return (
      <textarea
        ref={setRefs}
        className={cn(
          'w-full resize-none rounded-lg border border-border bg-surface px-3 py-2',
          'text-small leading-relaxed text-foreground',
          'max-h-[55vh] overflow-y-auto',
          className,
        )}
        {...props}
      />
    );
  },
);
AutoTextarea.displayName = 'AutoTextarea';

export { AutoTextarea };