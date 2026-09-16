'use client';

import type { ReactNode } from 'react';

/**
 * Khối tính năng đã thiết kế nhưng backend chưa có đường gọi.
 *
 * Vẽ chúng như đang chạy là nói dối; bỏ hẳn đi thì người đọc màn hình không
 * biết chúng đã được cân nhắc. Cả hai đều sai — nên chúng hiện ra, viền đứt,
 * có nhãn, nút tắt, và một câu nói rõ còn thiếu gì.
 *
 * `<fieldset disabled>` chứ không gắn `disabled` lên từng nút: nó tắt mọi
 * control bên trong, kể cả control ai đó thêm vào sau, nên không có ca "một
 * nút lọt lưới rồi gọi một route không tồn tại".
 */
export function NotBuiltYetPanel({
  title,
  missing,
  children,
}: {
  title: string;
  missing: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative rounded-lg border border-dashed border-border bg-surface p-4">
      <span className="absolute -top-2.5 right-3 rounded-sm border border-dashed border-border bg-background px-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        chưa có
      </span>
      <h3 className="text-small font-semibold">{title}</h3>
      {children && (
        <fieldset disabled className="mt-2.5 flex flex-wrap gap-2 opacity-55">
          {children}
        </fieldset>
      )}
      <p className="mt-2.5 border-l-2 border-border pl-2.5 text-caption leading-relaxed text-muted-foreground">
        {missing}
      </p>
    </section>
  );
}
