'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useSaveRubric } from '@/hooks/useGrading';
import { useCopyErrors } from '@/hooks/useRubricErrors';
import type { Rubric } from '@/lib/api/grading';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { shorten } from '@/lib/rubric-board';
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
import { cn } from '@/lib/utils';

/**
 * Sửa tiêu chí & điểm tối đa của một rubric, hoặc tạo rubric mới (spec mục 5, D3). Giữ nguyên ý của hộp thoại cũ:
 * tiêu chí CÓ SẴN gửi lại KHOÁ gốc của nó và không cho gõ khoá — máy chủ sinh lại khoá từ mô tả cho tiêu chí nào
 * thiếu `key`, nên sửa một câu mô tả từng âm thầm cắt liên kết "lỗi → tiêu chí". Chỉ tiêu chí MỚI có ô khoá (tuỳ chọn).
 *
 * Tạo rubric: nếu giảng viên đã có rubric khác, mặc định là "sao chép từ một rubric đã có" — nhưng KHÔNG chọn sẵn
 * nguồn nào (D3). Tiêu chí sao chép GIỮ khoá của nguồn, vì đó là cách máy chủ ghép lỗi sang rubric mới.
 *
 * Ruột form nằm TRONG DialogContent — mỗi lần mở là một lần mount mới, không thừa hưởng nội dung gõ dở.
 */
export function RubricDialog({
  open,
  onOpenChange,
  rubric,
  existingNames,
  errorCounts,
  overviews,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bản mới nhất của rubric cần sửa; bỏ trống = tạo rubric mới. */
  rubric?: Rubric;
  existingNames: string[];
  /** Số lỗi ĐANG DÙNG gắn vào mỗi khoá tiêu chí — để cảnh báo khi xoá tiêu chí. */
  errorCounts: Record<string, number>;
  /** Mọi rubric của giảng viên: nguồn để sao chép khi tạo rubric mới. */
  overviews: RubricOverview[];
  onSaved: (saved: Rubric) => void;
}) {
  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {rubric ? (
          <RubricForm rubric={rubric} existingNames={existingNames} errorCounts={errorCounts} onSaved={onSaved} onClose={close} />
        ) : (
          <CreateBody existingNames={existingNames} overviews={overviews} onSaved={onSaved} onClose={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateBody({
  existingNames,
  overviews,
  onSaved,
  onClose,
}: {
  existingNames: string[];
  overviews: RubricOverview[];
  onSaved: (saved: Rubric) => void;
  onClose: () => void;
}) {
  const hasAny = overviews.length > 0;
  const [mode, setMode] = useState<'copy' | 'blank'>(hasAny ? 'copy' : 'blank');
  const [source, setSource] = useState('');
  const src = mode === 'copy' ? overviews.find((o) => o.rubricName === source) : undefined;

  const option = (id: 'copy' | 'blank', title: string, text: string) => (
    <button
      type="button"
      aria-pressed={mode === id}
      onClick={() => setMode(id)}
      className={cn(
        'flex flex-col gap-1 rounded-lg border p-3 text-left',
        mode === id ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-surface-2',
      )}
    >
      <b className="text-small font-semibold">{title}</b>
      <span className="text-caption text-muted-foreground">{text}</span>
    </button>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Tạo rubric mới</DialogTitle>
      </DialogHeader>

      {hasAny && (
        <div role="group" aria-label="Bắt đầu từ" className="grid gap-2.5 sm:grid-cols-2">
          {option('copy', 'Một rubric đã có (khuyên dùng)', 'Sao chép tiêu chí, điểm tối đa, lỗi và điểm trừ. Sau đó hai rubric độc lập: sửa bên này không đổi bên kia.')}
          {option('blank', 'Tạo trống', 'Tự nhập tiêu chí và điểm tối đa; thêm lỗi sau.')}
        </div>
      )}

      {mode === 'copy' && (
        <FormField id="rubric-source" label="Sao chép từ">
          <select
            id="rubric-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-surface px-3 text-body"
          >
            <option value="">Chọn rubric muốn sao chép…</option>
            {overviews.map((o) => (
              <option key={o.rubricName} value={o.rubricName}>
                {o.rubricName} — {o.errorCount} lỗi
              </option>
            ))}
          </select>
        </FormField>
      )}

      {mode === 'copy' && !src ? (
        <>
          <p className="text-small text-muted-foreground">Chọn rubric ở trên để xem các tiêu chí sẽ được sao chép. Bạn vẫn sửa được trước khi tạo.</p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="button" variant="primary" disabled title="Chọn rubric muốn sao chép, hoặc chọn Tạo trống">
              Tạo rubric
            </Button>
          </DialogFooter>
        </>
      ) : (
        <RubricForm
          key={`${mode}:${source}`}
          existingNames={existingNames}
          errorCounts={{}}
          onSaved={onSaved}
          onClose={onClose}
          seed={
            src
              ? {
                  name: `${src.rubricName} — bản sao`,
                  rows: src.criteria.map((c) => ({
                    id: `src-${c.key}`,
                    key: c.key,
                    existing: true,
                    description: c.description,
                    maxPoints: String(c.maxPoints),
                  })),
                }
              : undefined
          }
          copyFrom={src ? { name: src.rubricName, errorCount: src.errorCount } : undefined}
        />
      )}
    </>
  );
}

/** Dấu vân tay các hàng — để biết giảng viên đã đổi gì so với bản đang dùng. */
const fingerprint = (rows: CriterionRow[]) =>
  JSON.stringify(rows.map((r) => [r.id, r.key.trim(), r.description.trim(), parseCap(r.maxPoints)]));

function RubricForm({
  rubric,
  existingNames,
  errorCounts,
  onSaved,
  onClose,
  seed,
  copyFrom,
}: {
  rubric?: Rubric;
  existingNames: string[];
  errorCounts: Record<string, number>;
  onSaved: (saved: Rubric) => void;
  onClose: () => void;
  /** Tạo từ bản sao: tên và hàng tiêu chí điền sẵn (đều sửa được). */
  seed?: { name: string; rows: CriterionRow[] };
  /** Có = sau khi lưu có thể sao chép lỗi từ rubric này sang rubric mới. */
  copyFrom?: { name: string; errorCount: number };
}) {
  const seq = useRef(0);
  const nextId = () => `new-${++seq.current}`;
  const [name, setName] = useState(seed?.name ?? '');
  const [initialRows] = useState<CriterionRow[]>(() => (rubric ? rowsFromRubric(rubric) : (seed?.rows ?? [newRow('new-0')])));
  const [rows, setRows] = useState<CriterionRow[]>(initialRows);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [copyErrorsToo, setCopyErrorsToo] = useState(true);
  const save = useSaveRubric();
  const copy = useCopyErrors();

  const editing = rubric !== undefined;
  const errors = validateRubric({ name, nameEditable: !editing, existingNames }, rows);
  const changed = !editing || fingerprint(rows) !== fingerprint(initialRows);
  const busy = save.isPending || copy.isPending;
  const canSave = !hasErrors(errors) && changed && !busy;

  const touch = (field: string) => setTouched((prev) => new Set(prev).add(field));
  const shown = (field: string, message: string | undefined) => (touched.has(field) ? message : undefined);
  const patchRow = (id: string, patch: Partial<CriterionRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const warnings = removedKeys(rubric, rows)
    .map((key) => ({ key, count: errorCounts[key] ?? 0, title: shorten(rubric?.criteria.find((c) => c.key === key)?.description ?? key, 40) }))
    .filter((w) => w.count > 0);

  function finish(saved: Rubric) {
    onSaved(saved);
    onClose();
  }

  function submit() {
    save.mutate(buildSaveInput(editing ? rubric.name : name, rows), {
      onSuccess: (saved) => {
        if (!copyFrom || !copyErrorsToo) {
          finish(saved);
          return;
        }
        copy.mutate(
          { from: copyFrom.name, to: saved.name },
          {
            onSuccess: (r) => toast.success(`Đã tạo “${saved.name}” từ “${copyFrom.name}” — sao chép ${r.copied} lỗi. Hai rubric từ giờ độc lập.`),
            // Rubric ĐÃ được tạo: không rollback, chỉ nói rõ và chỉ đường làm lại ở dải "Rubric mới".
            onError: (e) =>
              toast.error(`Đã tạo “${saved.name}” nhưng chưa sao chép được lỗi — ${e.message}. Bạn có thể sao chép lại ở dải “Rubric mới”.`),
            onSettled: () => finish(saved),
          },
        );
      },
    });
  }

  return (
    <>
      {editing && (
        <DialogHeader>
          <DialogTitle>Sửa tiêu chí &amp; điểm tối đa — {rubric.name}</DialogTitle>
        </DialogHeader>
      )}

      <p className="text-caption text-muted-foreground">
        Hệ thống tự giữ lịch sử mọi lần sửa: bài đã chấm và phiên thi đã gắn rubric này giữ nguyên kết quả cũ.
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
                  label={`Điểm tối đa ${n}`}
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
                  Khoá <span className="font-mono">{row.key}</span> — cố định, các lỗi gắn với tiêu chí này theo khoá đó.
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

      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setRows((prev) => [...prev, newRow(nextId())])}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Thêm tiêu chí
      </Button>

      {copyFrom && (
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" className="mt-1" checked={copyErrorsToo} onChange={(e) => setCopyErrorsToo(e.target.checked)} />
          <span>
            <b className="font-semibold">Sao chép cả {copyFrom.errorCount} lỗi và điểm trừ</b>
            <br />
            <span className="text-small text-muted-foreground">
              Lỗi thuộc tiêu chí bạn xoá khỏi rubric mới sẽ không được sao chép. Lỗi AI đề xuất không sao chép.
            </span>
          </span>
        </label>
      )}

      {errors.general && (
        <p role="alert" className="text-small font-medium text-danger-strong">
          {errors.general}
        </p>
      )}

      {warnings.map((w) => (
        <Alert key={w.key} variant="warning">
          <AlertDescription>
            Còn {w.count} lỗi đang nằm trong tiêu chí “{w.title}” — sau khi lưu, chúng cần được chuyển sang tiêu chí khác.
          </AlertDescription>
        </Alert>
      ))}

      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{save.error?.message}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="button" variant="primary" disabled={!canSave} loading={busy} onClick={submit}>
          {editing ? 'Lưu thay đổi' : 'Tạo rubric'}
        </Button>
      </DialogFooter>
    </>
  );
}
