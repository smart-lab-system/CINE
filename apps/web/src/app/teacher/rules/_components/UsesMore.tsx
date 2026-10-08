'use client';

import { useState } from 'react';
import { Popover } from '@/components/ui/popover';

export interface UseItem {
  key: string;
  name: string;
  sub?: string;
  value: string;
}

/** "và N rubric khác": mở danh sách đầy đủ, bấm một dòng để chuyển sang rubric đó (D7 — mọi chỗ liệt kê đều chặn trần). */
export function UsesMore({
  label,
  title,
  items,
  onPick,
}: {
  label: string;
  title: string;
  items: UseItem[];
  onPick?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={title}
      anchor={
        <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={() => setOpen((v) => !v)}>
          {label}
        </button>
      }
    >
      <h3 className="text-body font-semibold">{title}</h3>
      <ul className="flex max-h-64 flex-col overflow-auto">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
              onClick={() => {
                setOpen(false);
                onPick?.(item.name);
              }}
            >
              <span className="flex min-w-0 flex-col">
                <b className="truncate font-semibold">{item.name}</b>
                {item.sub && <span className="truncate text-small text-muted-foreground">{item.sub}</span>}
              </span>
              <span className="shrink-0 text-small font-semibold">{item.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
