import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind.config.ts đặt tên cho thang chữ (`text-h1` ... `text-caption`, `text-beacon`). tailwind-merge không biết các
 * tên đó là CỠ CHỮ nên coi `text-small` là một màu chữ — và khi một màu chữ thật (`text-foreground`, `text-white`) đứng
 * sau trong cùng chuỗi, nó vứt cỡ chữ đi: Button và Badge từng bị render ở 16px thay vì 14px/12px của thiết kế.
 * Khai báo ở đây cho nó biết các tên đó là một nhóm cỡ chữ. Giữ danh sách này khớp `theme.extend.fontSize` trong
 * tailwind.config.ts (có test canh).
 *
 * Nhóm RIÊNG chứ không nhét vào `font-size` của tailwind-merge: nhóm đó mặc định gỡ mọi `leading-*` đứng trước (vì
 * `text-lg` mang line-height theo). Nếu thang đặt tên cũng làm vậy thì `CardTitle` (`text-h2 leading-none`) gọi với
 * `className="text-h3"` sẽ mất `leading-none` ở hàng chục chỗ — đổi giao diện ngoài việc sửa lỗi cỡ chữ. Nên: hai nhóm
 * thay thế được nhau, và cùng không đụng tới `leading-*`, y như hành vi trước khi sửa.
 */
const twMerge = extendTailwindMerge<'font-size-named'>({
  extend: {
    classGroups: {
      'font-size-named': [{ text: ['display', 'h1', 'h2', 'h3', 'body', 'small', 'caption', 'beacon'] }],
    },
    conflictingClassGroups: {
      'font-size-named': ['font-size'],
      'font-size': ['font-size-named'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
