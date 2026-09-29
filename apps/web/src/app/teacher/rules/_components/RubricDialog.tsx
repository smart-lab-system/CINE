'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useSaveRubric } from '@/hooks/useGrading';
import {
  buildSaveInput,
  hasErrors,
  newRow,
  parseCap,
  removedKeys,
  rowsFromRubric,
  validateRubric,
  type CriterionRow,
} from '@/lib/rubric-form';
import type { Rubric } from '@/lib/api/grading';

/**
 * Sửa trần điểm của một rubric, hoặc tạo rubric mới (spec §3.1). Thay việc của trang Rubric cũ.
 *
 * Khác RubricEditor cũ ở điều quan trọng nhất: tiêu chí CÓ SẴN gửi lại KEY gốc của nó và không cho gõ key —
 * server sinh lại key từ mô tả cho tiêu chí nào thiếu `key`, nên sửa một câu mô tả từng âm thầm cắt liên kết
 * "luật → tiêu chí" (mọi luật đó thành "lệch tiêu chí"). Chỉ tiêu chí MỚI có ô key (tuỳ chọn).
 *
 * Ruột form nằm TRONG DialogContent — mỗi lần mở là một lần mount mới, không thừa hưởng nội dung gõ dở.
 */
export function RubricDialog({
  open,
  onOpenChange,
  rubric,
  existingNames,
  ruleCounts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bản đang dùng của rubric cần sửa; bỏ trống = tạo rubric mới. */
  rubric?: Rubric;
  existingNames: string[];
  /** Số luật ĐANG DÙNG trỏ vào mỗi khoá tiêu chí — để cảnh báo khi xoá tiêu chí. */
  ruleCounts: Record<string, number>;
  onSaved: (saved: Rubric) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <RubricForm
          rubric={rubric}
          existingNames={existingNames}
          ruleCounts={ruleCounts}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Dấu vân tay các hàng — để biết giảng viên đã đổi gì so với bản đang dùng. */
const fingerprint = (rows: CriterionRow[]) =>
  JSON.stringify(rows.map((r) => [r.id, r.key.trim(), r.description.trim(), parseCap(r.maxPoints)]));

function RubricForm({
  rubric,
  existingNames,
  ruleCounts,
  onSaved,
  onClose,
}: {
  rubric?: Rubric;
  existingNames: string[];
  ruleCounts: Record<string, number>;
  onSaved: (saved: Rubric) => void;
  onClose: () => void;
}) {
  const seq = useRef(0);
  const nextId = () => `new-${++seq.current}`;
  const [name, setName] = useState('');
  const [initialRows] = useState<CriterionRow[]>(() => (rubric ? rowsFromRubric(rubric) : [newRow('new-0')]));
  const [rows, setRows] = useState<CriterionRow[]>(initialRows);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const save = useSaveRubric();

  const editing = rubric !== undefined;
  const errors = validateRubric({ name, nameEditable: !editing, existingNames }, rows);
  const changed = !editing || fingerprint(rows) !== fingerprint(initialRows);
  const canSave = !hasErrors(errors) && changed && !save.isPending;

  const touch = (field: string) => setTouched((prev) => new Set(prev).add(field));
  const shown = (field: string, message: string | undefined) => (touched.has(field) ? message : undefined);
  const patchRow = (id: string, patch: Partial<CriterionRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const warnings = removedKeys(rubric, rows)
    .map((key) => ({ key, count: ruleCounts[key] ?? 0 }))
    .filter((w) => w.count > 0);

  function submit() {
    save.mutate(buildSaveInput(editing ? rubric.name : name, rows), {
      onSuccess: (saved) => {
        onSaved(saved);
        onClose();
      },
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? `Sửa trần điểm — ${rubric.name}` : 'Rubric mới'}</DialogTitle>
      </DialogHeader>

      <p className="text-caption text-muted-foreground">
        Mỗi lần lưu tạo một phiên bản mới. Bài đã chấm và phiên thi đã gắn phiên bản cũ vẫn giữ nguyên bản đó — sửa
        rubric không làm đổi những kết quả đã có.
      </p>

      {!editing && (
        <FormField id="rubric-name" label="Tên rubric" error={shown('name', errors.name)}>
          <Input
            id="rubric-name"
            value={name}
            invalid={shown('name', errors.name) !== undefined}
            placeholder="Ví dụ: Giữa kỳ CTDL"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => touch('name')}
          />
        </FormField>
      )}

      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const n = index + 1;
          const rowErrors = errors.rows[row.id] ?? {};
          return (
            <div key={row.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <FormField
                  id={`criterion-${row.id}`}
                  label={`Tiêu chí ${n}`}
                  className="flex-1"
                  error={shown(`${row.id}:description`, rowErrors.description)}
                >
                  <Input
                    id={`criterion-${row.id}`}
                    value={row.description}
                    invalid={shown(`${row.id}:description`, rowErrors.description) !== undefined}
                    placeholder="Ví dụ: Trình bày thuật toán rõ ràng, có độ phức tạp"
                    onChange={(e) => patchRow(row.id, { description: e.target.value })}
                    onBlur={() => touch(`${row.id}:description`)}
                  />
                </FormField>
                <FormField
                  id={`cap-${row.id}`}
                  label={`Trần điểm ${n}`}
                  className="w-full sm:w-32"
                  error={shown(`${row.id}:maxPoints`, rowErrors.maxPoints)}
                >
                  <Input
                    id={`cap-${row.id}`}
                    inputMode="decimal"
                    value={row.maxPoints}
                    invalid={shown(`${row.id}:maxPoints`, rowErrors.maxPoints) !== undefined}
                    onChange={(e) => patchRow(row.id, { maxPoints: e.target.value })}
                    onBlur={() => touch(`${row.id}:maxPoints`)}
                  />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 hover:bg-danger-subtle hover:text-danger-strong sm:mt-7"
                  aria-label={`Xoá tiêu chí ${n}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              {row.existing ? (
                <p className="text-caption text-muted-foreground">
                  Khoá <span className="font-mono">{row.key}</span> — cố định, các luật trỏ vào tiêu chí này bằng khoá đó.
                </p>
              ) : (
                <FormField
                  id={`key-${row.id}`}
                  label={`Khoá tiêu chí ${n} (tuỳ chọn)`}
                  error={shown(`${row.id}:key`, rowErrors.key)}
                  hint="Để trống: hệ thống tự đặt từ mô tả. Không đổi được sau khi lưu."
                >
                  <Input
                    id={`key-${row.id}`}
                    className="font-mono"
                    value={row.key}
                    invalid={shown(`${row.id}:key`, rowErrors.key) !== undefined}
                    onChange={(e) => patchRow(row.id, { key: e.target.value })}
                    onBlur={() => touch(`${row.id}:key`)}
                  />
                </FormField>
              )}
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setRows((prev) => [...prev, newRow(nextId())])}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Thêm tiêu chí
      </Button>

      {errors.general && (
        <p role="alert" className="text-small font-medium text-danger-strong">
          {errors.general}
        </p>
      )}

      {warnings.map((w) => (
        <Alert key={w.key} variant="warning">
          <AlertDescription>
            Còn {w.count} luật đang trỏ vào tiêu chí <span className="font-mono">{w.key}</span> — sau khi lưu, chúng báo
            &quot;lệch tiêu chí&quot; cho tới khi bạn gán lại.
          </AlertDescription>
        </Alert>
      ))}

      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{save.error.message}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="button" disabled={!canSave} loading={save.isPending} onClick={submit}>
          {editing ? 'Lưu thành phiên bản mới' : 'Lưu rubric mới'}
        </Button>
      </DialogFooter>
    </>
  );
}
