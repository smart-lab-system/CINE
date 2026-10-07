'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
import type { ColumnMapping } from '@/lib/roster-file';

const PREVIEW_ROWS = 6;
const NONE = '__none__';

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
 */
export function ColumnMapper({ rows, mapping, onChange }: ColumnMapperProps) {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = Array.from({ length: columnCount }, (_, index) => index);
  const preview = rows.slice(0, PREVIEW_ROWS);

  const nameCol1 = mapping.nameColumns[0] ?? 0;
  const nameCol2 =
    mapping.nameColumns.length > 1 ? mapping.nameColumns[1]! : null;
  const nameSet = new Set(mapping.nameColumns);

  function setNameColumns(first: number, second: number | null) {
    const next =
      second === null || second === first
        ? [first]
        : [first, second].sort((a, b) => a - b);
    onChange({ ...mapping, nameColumns: next });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="roster-header-rows">Số dòng tiêu đề</Label>
          <Input
            id="roster-header-rows"
            type="number"
            min={0}
            max={20}
            value={mapping.headerRows}
            onChange={(event) =>
              onChange({
                ...mapping,
                headerRows: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
          <p className="text-caption text-muted-foreground">
            Số dòng ở đầu file cần bỏ qua trước khi tới dữ liệu.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="roster-mssv-column">Cột MSSV (8 chữ số)</Label>
          <Select
            value={String(mapping.mssvColumn)}
            onValueChange={(value) =>
              onChange({ ...mapping, mssvColumn: Number(value) })
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

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className="w-12 text-right">
                #
              </TableHead>
              {columns.map((index) => (
                <TableHead
                  key={index}
                  scope="col"
                  data-selected={
                    index === mapping.mssvColumn || nameSet.has(index)
                      ? ''
                      : undefined
                  }
                  className="data-[selected]:bg-primary-subtle data-[selected]:text-primary"
                >
                  {columnLabel(index)}
                  {index === mapping.mssvColumn && ' · MSSV'}
                  {nameSet.has(index) && ' · Họ tên'}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                className={rowIndex < mapping.headerRows ? 'opacity-40' : undefined}
              >
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
      </div>
      {rows.length > PREVIEW_ROWS && (
        <p className="text-caption text-muted-foreground">
          Đang xem {PREVIEW_ROWS} dòng đầu trên tổng số {rows.length} dòng.
        </p>
      )}
    </div>
  );
}
