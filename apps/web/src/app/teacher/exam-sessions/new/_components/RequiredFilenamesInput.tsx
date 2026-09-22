'use client';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CreateExamSessionFormValues } from '../schema';
import { ArchiveEntriesField } from './ArchiveEntriesField';

/**
 * What the server fills each token with, and a sample value for the
 * preview.
 *
 * The samples are already ASCII and separator-free on purpose: for values
 * like these the server's rendering is pure substitution, so the preview is
 * exactly what a student would get without this file having to carry a
 * second copy of the server's normalizer. A name with diacritics is
 * stripped there — said in the note below rather than half-imitated here.
 */
const TOKENS = [
  { token: '{MSSV}', label: 'MSSV', sample: 'SV20120001' },
  { token: '{TEN}', label: 'Họ tên', sample: 'NguyenVanAn' },
  { token: '{PHONG}', label: 'Phòng', sample: 'PhongMayA1' },
  { token: '{SOMAY}', label: 'Số máy', sample: 'MAY07' },
] as const;

function preview(pattern: string): string {
  return TOKENS.reduce(
    (rendered, { token, sample }) => rendered.split(token).join(sample),
    pattern,
  );
}

function isTemplated(pattern: string): boolean {
  return TOKENS.some(({ token }) => pattern.includes(token));
}

/**
 * Controlled add/remove list of required filenames, wired into the parent
 * form via `useFormContext` — the parent (`page.tsx`) wraps its `useForm()`
 * in `<FormProvider>`, so this reads/writes the same form state instead of
 * owning its own.
 *
 * Presented as one bordered group rather than loose fields: these names
 * are a single decision ("what counts as a submission"), and the agent
 * matches on them exactly, so they need to read as a checklist the teacher
 * can scan before starting an exam.
 */
export function RequiredFilenamesInput() {
  const {
    control,
    register,
    setValue,
    formState: { errors },
  } = useFormContext<CreateExamSessionFormValues>();

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'requiredFilenames',
  });

  const listError = errors.requiredFilenames?.message ?? errors.requiredFilenames?.root?.message;

  // Watched rather than read from `fields`: useFieldArray's `fields` holds
  // the values as of the last append/remove, so a preview built from it
  // would lag one keystroke behind everything the teacher types.
  const values = useWatch({ control, name: 'requiredFilenames' });

  /**
   * Inserts a token at the caret of the row it belongs to, rather than
   * appending. A teacher building `{PHONG}_{MSSV}_...` types the separator
   * and then wants the next token exactly there.
   */
  function insertToken(index: number, token: string) {
    const input = document.getElementById(
      `required-filename-${index}`,
    ) as HTMLInputElement | null;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = input.value.slice(0, start) + token + input.value.slice(end);
    setValue(`requiredFilenames.${index}.value`, next, {
      shouldValidate: true,
      shouldDirty: true,
    });
    // Put the caret after what was just inserted, so a second token lands
    // where the teacher is looking.
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/60 p-4">
      <legend className="px-1 text-body font-semibold text-foreground">File bắt buộc nộp</legend>

      <p className="text-small text-muted-foreground">
        Máy sinh viên chỉ thu đúng những file có tên dưới đây. Chỉ dùng chữ, số,{' '}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-caption">_</code>{' '}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-caption">-</code>{' '}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-caption">.</code>
      </p>

      <p className="text-small text-muted-foreground">
        Muốn mỗi sinh viên nộp một tên file riêng thì chèn các ô dưới đây — máy chủ tự điền
        theo danh sách lớp, sinh viên không phải tự đặt tên. Dấu tiếng Việt trong họ tên sẽ
        được bỏ đi (&quot;Nguyễn Văn An&quot; → <code className="font-mono">NguyenVanAn</code>).
      </p>

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const fieldError = errors.requiredFilenames?.[index]?.value;
          return (
            <div key={field.id} className="flex flex-col gap-2">
              <Label htmlFor={`required-filename-${index}`} className="sr-only">
                {`File bắt buộc số ${index + 1}`}
              </Label>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-caption text-muted-foreground">Chèn:</span>
                {TOKENS.map(({ token, label }) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => insertToken(index, token)}
                    className="rounded border border-border bg-surface px-2 py-0.5 font-mono text-caption text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {token}
                    <span className="sr-only"> — {label}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id={`required-filename-${index}`}
        placeholder="vd: bai_lam.docx hoặc {MSSV}_{TEN}.docx"
                  className="font-mono"
                  invalid={Boolean(fieldError)}
                  {...register(`requiredFilenames.${index}.value` as const)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  // The list can't go empty — the schema requires at least
                  // one entry, so removing the last row would put the form
                  // into a state it can never submit from.
                  disabled={fields.length === 1}
                  aria-label={`Xoá file bắt buộc số ${index + 1}`}
                  title={
                    fields.length === 1
                      ? 'Cần ít nhất 1 file bắt buộc'
                      : 'Xoá file này khỏi danh sách'
                  }
                  className="shrink-0 hover:bg-danger-subtle hover:text-danger-strong"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              {fieldError ? (
                <p
                  role="alert"
                  className="flex items-start gap-1.5 text-small font-medium text-danger-strong"
                >
                  <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {fieldError.message}
                </p>
              ) : (
                isTemplated(values?.[index]?.value ?? '') && (
                  // Shown only for a pattern: a literal filename previews to
                  // itself, and a line saying so would be noise on every row.
                  <p className="text-caption text-muted-foreground">
                    Ví dụ với một sinh viên:{' '}
                    <code className="font-mono text-foreground">
                      {preview(values[index].value)}
                    </code>
                  </p>
                )
              )}
              <ArchiveEntriesField index={index} />
            </div>
          );
        })}
      </div>

      {listError && (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-small font-medium text-danger-strong"
        >
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {listError}
        </p>
      )}

      <Button type="button" variant="outline" size="sm" onClick={() => append({ value: '' })} className="self-start">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Thêm file
      </Button>
    </fieldset>
  );
}
