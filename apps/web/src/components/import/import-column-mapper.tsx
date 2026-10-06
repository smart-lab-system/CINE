'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { columnLabel, type ImportKind, type ImportMapping } from '@/lib/import/columns';

const PREVIEW_ROWS = 6;
/** Radix Select không nhận chuỗi rỗng làm giá trị, nên "không có cột này" cần một khoá riêng. */
const NONE = 'none';

interface ImportColumnMapperProps {
  kind: ImportKind;
  rows: string[][];
  mapping: ImportMapping;
  onChange: (mapping: ImportMapping) => void;
}

/**
 * Chọn cột nào của file là trường nào — điều khiển bởi MÔ TẢ CỘT của loại đang nhập, không gắn cứng "Cột MSSV" như bước ghép
 * cột của roster. Chỉ hiện khi tên cột chưa nhận diện được hoặc người dùng chủ động chỉnh (spec §6.2 nguyên tắc 8): nhận
 * diện theo tên đi trước, bước này là lối thoát cho file có tên cột lạ.
 */
export function ImportColumnMapper({ kind, rows, mapping, onChange }: ImportColumnMapperProps) {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = Array.from({ length: columnCount }, (_, index) => index);
  const headerRow = rows[Math.max(mapping.headerRows - 1, 0)] ?? [];
  const labelByColumn = new Map<number, string>();
  for (const column of kind.columns) {
    const index = mapping.columns[column.key];
    if (index !== null && index !== undefined) labelByColumn.set(index, column.label);
  }

  function setColumn(key: string, value: string) {
    const next = value === NONE ? null : Number(value);
    const columns = { ...mapping.columns };
    if (next !== null) {
      // Một cột của file không bao giờ gán cho hai trường (cùng bất biến với `detectMapping`): chọn một cột đang thuộc về
      // trường khác thì HAI TRƯỜNG HOÁN ĐỔI — trường kia nhận cột cũ của trường này. Hoán đổi thay vì xoá, vì xoá làm một
      // cột bắt buộc đột nhiên "chưa chọn" mà người dùng không hề bấm vào nó.
      const holder = Object.keys(columns).find((other) => other !== key && columns[other] === next);
      if (holder) columns[holder] = columns[key] ?? null;
    }
    columns[key] = next;
    onChange({ ...mapping, columns });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-header-rows">Số dòng tiêu đề</Label>
          <Input
            id="import-header-rows"
            type="number"
            min={0}
            max={20}
            value={mapping.headerRows}
            onChange={(event) =>
              onChange({ ...mapping, headerRows: Math.max(0, Number(event.target.value) || 0) })
            }
          />
          <p className="text-caption text-muted-foreground">Số dòng ở đầu file cần bỏ qua trước khi tới dữ liệu.</p>
        </div>

        {kind.columns.map((column) => {
          const index = mapping.columns[column.key];
          return (
            <div key={column.key} className="flex flex-col gap-2">
              <Label htmlFor={`import-col-${column.key}`}>
                {column.label}
                {column.required ? '' : ' (không bắt buộc)'}
              </Label>
              <Select
                value={index === null || index === undefined ? (column.required ? undefined : NONE) : String(index)}
                onValueChange={(value) => setColumn(column.key, value)}
              >
                <SelectTrigger id={`import-col-${column.key}`}>
                  <SelectValue placeholder="Chọn cột" />
                </SelectTrigger>
                <SelectContent>
                  {!column.required && <SelectItem value={NONE}>Không có cột này</SelectItem>}
                  {columns.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      Cột {columnLabel(option)}
                      {(headerRow[option] ?? '').trim() !== '' ? ` · ${headerRow[option].trim().slice(0, 24)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
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
                  data-selected={labelByColumn.has(index) ? '' : undefined}
                  className="data-[selected]:bg-primary-subtle data-[selected]:text-primary"
                >
                  {columnLabel(index)}
                  {labelByColumn.has(index) && ` · ${labelByColumn.get(index)}`}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, PREVIEW_ROWS).map((row, rowIndex) => (
              // Dòng tiêu đề mờ đi để "số dòng tiêu đề" là thứ nhìn thấy được hiệu quả chứ không phải đoán.
              <TableRow key={rowIndex} className={rowIndex < mapping.headerRows ? 'opacity-40' : undefined}>
                <TableCell className="text-right tabular-nums text-muted-foreground">{rowIndex + 1}</TableCell>
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
