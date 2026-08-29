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
 * Which column is the MSSV and which is the name — asked, never inferred.
 *
 * CLAUDE.md Security rule 9 forbids guessing a column from its header for
 * GradeExport, and a roster is the same problem seen earlier: a wrong guess
 * here admits every student under someone else's identity, and nothing about
 * the result looks wrong. So the file is shown as a grid with its real
 * column letters and the user points at the two that matter.
 */
export function ColumnMapper({ rows, mapping, onChange }: ColumnMapperProps) {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = Array.from({ length: columnCount }, (_, index) => index);
  const preview = rows.slice(0, PREVIEW_ROWS);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
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
          <Label htmlFor="roster-mssv-column">Cột MSSV</Label>
          <Select
            value={String(mapping.mssvColumn)}
            onValueChange={(value) => onChange({ ...mapping, mssvColumn: Number(value) })}
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
          <Label htmlFor="roster-name-column">Cột họ tên</Label>
          <Select
            value={String(mapping.nameColumn)}
            onValueChange={(value) => onChange({ ...mapping, nameColumn: Number(value) })}
          >
            <SelectTrigger id="roster-name-column">
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
                    index === mapping.mssvColumn || index === mapping.nameColumn
                      ? ''
                      : undefined
                  }
                  className="data-[selected]:bg-primary-subtle data-[selected]:text-primary"
                >
                  {columnLabel(index)}
                  {index === mapping.mssvColumn && ' · MSSV'}
                  {index === mapping.nameColumn && ' · Họ tên'}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                // Header rows are dimmed so "số dòng tiêu đề" is something
                // the user can see the effect of rather than guess at.
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
