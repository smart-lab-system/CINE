'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AuditLogEntry } from '@/lib/api/audit-log';
import { ACTOR_SYSTEM_LABEL, describeAuditEntry } from '@/lib/audit-describe';

const DATE_TIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function Value({
  title,
  value,
  truncated,
}: {
  title: string;
  value: Record<string, unknown> | null;
  truncated: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className="text-small font-semibold text-foreground">{title}</p>
      {truncated ? (
        <p className="text-small italic text-muted-foreground">
          Giá trị quá lớn (hơn 4 KB) nên không hiển thị trong danh sách.
        </p>
      ) : (
        <pre className="max-h-64 overflow-auto rounded-md bg-surface-2 p-3 text-caption">
          {JSON.stringify(value ?? {}, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AuditTable({ entries }: { entries: AuditLogEntry[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-44">Thời gian</TableHead>
            <TableHead scope="col" className="w-56">Người thực hiện</TableHead>
            <TableHead scope="col">Nội dung</TableHead>
            <TableHead scope="col" className="w-12 text-right">
              <span className="sr-only">Chi tiết</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const expanded = open.has(entry.id);
            return (
              <Fragment key={entry.id}>
                <TableRow>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {DATE_TIME.format(new Date(entry.occurredAt))}
                  </TableCell>
                  <TableCell>
                    {entry.actor ? (
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{entry.actor.name}</span>
                        <span className="text-small text-muted-foreground">{entry.actor.email}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{ACTOR_SYSTEM_LABEL}</span>
                    )}
                  </TableCell>
                  <TableCell>{describeAuditEntry(entry)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-expanded={expanded}
                      aria-label={expanded ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                      onClick={() => toggle(entry.id)}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4}>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Value title="Trước" value={entry.oldValue} truncated={entry.oldValueTruncated} />
                        <Value title="Sau" value={entry.newValue} truncated={entry.newValueTruncated} />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
