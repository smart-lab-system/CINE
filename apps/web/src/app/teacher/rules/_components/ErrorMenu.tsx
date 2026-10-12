'use client';

import { Ellipsis } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { RubricErrorItem } from '@/lib/api/rubric-errors';

// Primitive dùng tông teal cho trạng thái focus; trang này chỉ dùng một màu chủ đạo (D13) nên ghi đè ở đây.
const ITEM = 'flex flex-col items-start gap-0.5 focus:bg-primary-subtle focus:text-primary';

/** Menu ⋯ của một dòng lỗi: sửa nội dung lỗi, chuyển tiêu chí, gỡ khỏi rubric này. */
export function ErrorMenu({
  item,
  onEdit,
  onMove,
  onRemove,
}: {
  item: RubricErrorItem;
  onEdit: () => void;
  onMove: () => void;
  onRemove: () => void;
}) {
  const rubrics = item.alsoIn.length + 1;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Thao tác với ${item.name}`}
          className="grid h-[34px] w-[34px] place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <Ellipsis className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem className={ITEM} onSelect={onEdit}>
          <span>Sửa tên, mô tả, cách phát hiện</span>
          <small className="text-caption text-muted-foreground">
            {rubrics > 1
              ? `Lỗi này đang dùng ở ${rubrics} rubric — bạn chọn đổi cả ${rubrics} hoặc chỉ rubric này`
              : 'Chỉ rubric này đang dùng lỗi này'}
          </small>
        </DropdownMenuItem>
        <DropdownMenuItem className={ITEM} onSelect={onMove}>
          <span>Chuyển sang tiêu chí khác</span>
          <small className="text-caption text-muted-foreground">Chỉ đổi ở rubric này</small>
        </DropdownMenuItem>
        <DropdownMenuItem className={`${ITEM} text-danger-strong focus:text-danger-strong`} onSelect={onRemove}>
          <span>Gỡ khỏi rubric này</span>
          <small className="text-caption text-muted-foreground">Lỗi vẫn còn trong thư viện, ở rubric khác không đổi</small>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
