'use client';

import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CreateExamSessionFormValues } from '../page';

/**
 * Controlled add/remove list of required filenames, wired into the parent
 * form via `useFormContext` — the parent (`page.tsx`) wraps its `useForm()`
 * in `<FormProvider>`, so this reads/writes the same form state instead of
 * owning its own.
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
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">File bắt buộc nộp</legend>

      {fields.map((field, index) => {
        const fieldError = errors.requiredFilenames?.[index]?.value;
        return (
          <div key={field.id} className="flex flex-col gap-1.5">
            <Label htmlFor={`required-filename-${index}`}>{`File #${index + 1}`}</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`required-filename-${index}`}
                placeholder="vd: bai_lam.docx"
                {...register(`requiredFilenames.${index}.value` as const)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => remove(index)}
                disabled={fields.length === 1}
              >
                Xoá
              </Button>
            </div>
            {fieldError && (
              <p role="alert" className="text-sm text-destructive">
                {fieldError.message}
              </p>
            )}
          </div>
        );
      })}

      {listError && (
        <p role="alert" className="text-sm text-destructive">
          {listError}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => append({ value: '' })}
        className="self-start"
      >
        Thêm file
      </Button>
    </fieldset>
  );
}
