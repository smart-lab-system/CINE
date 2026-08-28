'use client';

import { useFieldArray, useFormContext } from 'react-hook-form';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CreateExamSessionFormValues } from '../page';

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
    formState: { errors },
  } = useFormContext<CreateExamSessionFormValues>();

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'requiredFilenames',
  });

  const listError = errors.requiredFilenames?.message ?? errors.requiredFilenames?.root?.message;

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/60 p-4">
      <legend className="px-1 text-body font-semibold text-foreground">File bắt buộc nộp</legend>

      <p className="text-small text-muted-foreground">
        Máy sinh viên chỉ thu đúng những file có tên dưới đây. Chỉ dùng chữ, số,{' '}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-caption">_</code>{' '}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-caption">-</code>{' '}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-caption">.</code>
      </p>

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const fieldError = errors.requiredFilenames?.[index]?.value;
          return (
            <div key={field.id} className="flex flex-col gap-2">
              <Label htmlFor={`required-filename-${index}`} className="sr-only">
                {`File bắt buộc số ${index + 1}`}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`required-filename-${index}`}
                  placeholder="vd: bai_lam.docx"
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
              {fieldError && (
                <p
                  role="alert"
                  className="flex items-start gap-1.5 text-small font-medium text-danger-strong"
                >
                  <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {fieldError.message}
                </p>
              )}
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
