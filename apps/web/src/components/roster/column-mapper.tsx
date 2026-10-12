'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ColumnMapping } from '@/lib/roster-file';

const NONE = '__none__';

const STICKY_HEAD_RULE = 'shadow-[inset_0_-1px_0_hsl(var(--border))]';

const SCROLL_CONTAINER = {
  role: 'region',
  'aria-label': 'Nội dung file Excel',
  tabIndex: 0,
  className: 'max-h-[min(32rem,70dvh)] overflow-auto rounded-md border border-border',
} as const;

/** Spreadsheet column letters, so the user maps against what Excel showed. */
function columnLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

interface ColumnMapperProps {
  rows: string[][];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}

/**
 * Chọn cột MSSV + họ tên (1 cột, hoặc 2 cột rồi ghép) — hỏi, không suy từ header.
 * Dòng tiêu đề / trống tự bỏ khi parse (không có MSSV 8 số).
 */
export function ColumnMapper({ rows, mapping, onChange }: ColumnMapperProps) {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = Array.from({ length: columnCount }, (_, index) => index);

  const nameCol1 = mapping.nameColumns[0] ?? 0;
  const nameCol2 =
    mapping.nameColumns.length > 1 ? mapping.nameColumns[1]! : null;
  const nameSet = new Set(mapping.nameColumns);

  function setNameColumns(first: number, second: number | null) {
    const next =
      second === null || second === first
        ? [first]
        : [first, second].sort((a, b) => a - b);
    onChange({ ...mapping, headerRows: 0, nameColumns: next });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="roster-mssv-column">Cột MSSV (8 chữ số)</Label>
          <Select
            value={String(mapping.mssvColumn)}
            onValueChange={(value) =>
              onChange({ ...mapping, headerRows: 0, mssvColumn: Number(value) })
            }
          >
            <SelectTrigger id="roster-mssv-column">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {columns.map((index) => (
                <SelectItem key={index} value={String(index)}>
                  Cột {columnLabel(index)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="roster-name-column-1">Cột họ tên</Label>
          <Select
            value={String(nameCol1)}
            onValueChange={(value) => setNameColumns(Number(value), nameCol2)}
          >
            <SelectTrigger id="roster-name-column-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {columns.map((index) => (
                <SelectItem key={index} value={String(index)}>
                  Cột {columnLabel(index)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="roster-name-column-2">Cột tên bổ sung (tuỳ chọn)</Label>
          <Select
            value={nameCol2 === null ? NONE : String(nameCol2)}
            onValueChange={(value) =>
              setNameColumns(nameCol1, value === NONE ? null : Number(value))
            }
          >
            <SelectTrigger id="roster-name-column-2">
              <SelectValue placeholder="Không dùng" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Không dùng</SelectItem>
              {columns.map((index) => (
                <SelectItem key={index} value={String(index)}>
                  Cột {columnLabel(index)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-caption text-muted-foreground">
            Ví dụ Họ đệm + Tên. Chỉ dòng có MSSV đúng 8 chữ số mới được lấy.
          </p>
        </div>
      </div>

      <Table container={SCROLL_CONTAINER}>
        <TableHeader className="sticky top-0 z-10 [&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className={cn('w-12 text-right', STICKY_HEAD_RULE)}>
              #
            </TableHead>
            {columns.map((index) => (
              <TableHead
                key={index}
                scope="col"
                data-selected={
                  index === mapping.mssvColumn || nameSet.has(index) ? '' : undefined
                }
                className={cn(
                  'data-[selected]:bg-primary-subtle data-[selected]:text-primary',
                  STICKY_HEAD_RULE,
                )}
              >
                {columnLabel(index)}
                {index === mapping.mssvColumn && ' · MSSV'}
                {nameSet.has(index) && ' · Họ tên'}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {rowIndex + 1}
              </TableCell>
              {columns.map((index) => (
                <TableCell key={index} className="max-w-[16rem] truncate">
                  {row[index] ?? ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-caption text-muted-foreground">
        {rows.length} dòng trong sheet — cuộn để xem toàn bộ. Dòng không có MSSV 8 chữ số sẽ
        bị bỏ qua khi nhập.
      </p>
    </div>
  );
}
