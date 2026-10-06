'use client';

import { CircleAlert, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { ImportKind } from '@/lib/import/columns';
import type { ImportResult, ImportRowResult, ImportSimilar } from '@/lib/import/import-types';

const REASON_TEXT: Record<ImportSimilar['reason'], string> = {
  normalized: 'chỉ khác dấu, hoa-thường hoặc ký tự đặc biệt',
  insert_delete: 'hơn kém đúng một ký tự',
  swap: 'hai ký tự liền kề đổi chỗ',
};

interface ImportPreviewProps {
  kind: ImportKind;
  result: ImportResult;
  confirmSimilar: boolean;
  onConfirmSimilarChange: (value: boolean) => void;
}

/**
 * Mọi thứ giữa "đã đọc file" và "xác nhận" — vẽ NGUYÊN VĂN kết quả `dryRun` của server (spec §6.2 nguyên tắc 5). Component
 * này không tính gì: nó không biết thế nào là "gần giống" hay "chồng ngày", chỉ biết trình bày. Vì thế bản xem trước và lần
 * ghi thật không thể lệch nhau ở phía trình duyệt.
 *
 * Thứ tự là thứ tự quyết định: lỗi (chặn tất cả) → mục gần giống (cần để ý) → cập nhật (có từ → đến) → thêm.
 */
export function ImportPreview({ kind, result, confirmSimilar, onConfirmSimilarChange }: ImportPreviewProps) {
  const { counts, rows } = result;
  const errors = rows.filter((r) => r.status === 'error');
  const added = rows.filter((r) => r.status === 'new');
  const updated = rows.filter((r) => r.status === 'update');
  const similar = added.filter((r) => r.similar.length > 0);
  const nothingToDo = counts.errors === 0 && counts.added === 0 && counts.updated === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="success">Thêm {counts.added}</Badge>
        <Badge variant="info">Sửa {counts.updated}</Badge>
        <Badge>Giữ nguyên {counts.unchanged}</Badge>
        {counts.errors > 0 && <Badge variant="destructive">Lỗi {counts.errors}</Badge>}
      </div>

      {errors.length > 0 && (
        <div className="flex flex-col gap-3">
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              File có {errors.length} dòng lỗi. Không có dòng nào được nhập — hãy sửa file rồi chọn lại.
            </AlertDescription>
          </Alert>
          <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border border-border bg-surface-2 p-4">
            {errors.map((row) => (
              <li key={row.line} className="flex flex-col gap-0.5 text-small">
                <span className="font-mono text-muted-foreground">Dòng {row.line}</span>
                {row.errors.map((message, index) => (
                  <span key={index}>{message}</span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {nothingToDo && (
        <Alert variant="info">
          <AlertDescription>
            File này khớp hoàn toàn với dữ liệu hiện có — nhập lại sẽ không thay đổi gì.
          </AlertDescription>
        </Alert>
      )}

      {similar.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-subtle p-4">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="text-small font-medium">{similar.length} mục mới gần giống mục khác</p>
              <p className="text-caption text-muted-foreground">
                Hệ thống không biết đó là cùng một thứ hay hai thứ khác nhau, nên hỏi trước khi ghi. Nếu là cùng một
                thứ, sửa file rồi chọn lại.
              </p>
            </div>
          </div>
          <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pl-6">
            {similar.flatMap((row) =>
              row.similar.map((entry, index) => (
                <li key={`${row.line}-${index}`} className="flex flex-col text-small">
                  <span>{describeSimilar(row, entry)}</span>
                  <span className="text-caption text-muted-foreground">
                    Dòng {row.line} · {REASON_TEXT[entry.reason]}
                  </span>
                </li>
              )),
            )}
          </ul>
          <label className="flex cursor-pointer items-start gap-2 pl-6 text-small">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={confirmSimilar}
              onChange={(event) => onConfirmSimilarChange(event.target.checked)}
            />
            <span>Tôi đã xem các mục gần giống ở trên và đúng là những {kind.noun} khác nhau.</span>
          </label>
        </div>
      )}

      {updated.length > 0 && (
        <ChangeList
          title="Sẽ cập nhật"
          items={updated.map((row) => ({
            key: row.line,
            label: row.label,
            lines: row.changes.map((c) => `${c.label}: ${c.from ?? '(trống)'} → ${c.to ?? '(trống)'}`),
          }))}
        />
      )}

      {added.length > 0 && (
        <ChangeList
          title="Sẽ thêm"
          // Dòng MỚI mang giá trị đã hiểu (`from = null`): hiện "Nhãn: giá trị", không "từ → đến" — đó là lưới an toàn cho ngày/giảng
          // viên bị hiểu sai (spec §6.3 "hiện ngày đã hiểu ở bản xem trước").
          items={added.map((row) => ({
            key: row.line,
            label: row.label,
            lines: row.changes.map((c) => `${c.label}: ${c.to ?? '(trống)'}`),
          }))}
        />
      )}
    </div>
  );
}

function describeSimilar(row: ImportRowResult, entry: ImportSimilar): string {
  const where = entry.source === 'existing' ? 'đã có' : `dòng ${entry.line} trong file`;
  return `"${row.label}" (mới) gần giống "${entry.name}" (${where})`;
}

function ChangeList({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: number; label: string; lines: string[] }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small font-medium">{title}</p>
      <ul className="max-h-56 overflow-y-auto rounded-md border border-border bg-surface-2 p-4">
        {items.map((item) => (
          <li key={item.key} className="flex flex-col text-small">
            <span className="font-mono">{item.label}</span>
            {item.lines.map((line, index) => (
              <span key={index} className="text-caption text-muted-foreground">
                {line}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
