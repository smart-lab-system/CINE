'use client';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { CircleAlert, Info, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ReplaceRequiredDeliverablesFormValues } from '../schema';

/**
 * Khối "Kiểm file bên trong (tuỳ chọn)" dưới gói nộp duy nhất.
 * Hub chỉ còn một deliverable `.zip`|`.rar` nên khối này luôn hiện
 * (spec 2026-11-28-single-archive-deliverable-design.md).
 */
export function ArchiveEntriesField({ index }: { index: number }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<ReplaceRequiredDeliverablesFormValues>();

  const packageName =
    useWatch({ control, name: `requiredFilenames.${index}.value` }) ?? 'gói nộp';

  const { fields, append, remove } = useFieldArray({
    control,
    name: `requiredFilenames.${index}.entries`,
  });

  const listError = errors.requiredFilenames?.[index]?.entries?.message;

  return (
    <div
      data-animate
      className="ml-1 flex flex-col gap-3 rounded-md border border-dashed border-border bg-surface/60 p-3"
    >
      <p className="text-caption font-semibold text-foreground">
        Kiểm file bên trong (tuỳ chọn)
      </p>

      <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Hệ thống kiểm sau khi thu bài. Sinh viên KHÔNG được cảnh báo lúc đang thi.
      </p>

      {fields.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          Chưa khai file nào - nộp đúng tên <code className="font-mono">{packageName}</code> là
          đủ, hệ thống không mở ra kiểm gì bên trong.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {fields.map((field, entryIndex) => {
            const fieldError = errors.requiredFilenames?.[index]?.entries?.[entryIndex]?.value;
            return (
              <div key={field.id} className="flex flex-col gap-1">
                <Label
                  htmlFor={`required-filename-${index}-entry-${entryIndex}`}
                  className="sr-only"
                >
                  {`File bên trong số ${entryIndex + 1} của ${packageName}`}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`required-filename-${index}-entry-${entryIndex}`}
                    placeholder="vd: Main.java hoặc {MSSV}_BaoCao.docx"
                    className="font-mono"
                    invalid={Boolean(fieldError)}
                    {...register(
                      `requiredFilenames.${index}.entries.${entryIndex}.value` as const,
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(entryIndex)}
                    aria-label={`Xoá file bên trong số ${entryIndex + 1}`}
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
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {listError ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-small font-medium text-danger-strong"
        >
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {listError}
        </p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ value: '' })}
        className="self-start"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Thêm file bên trong
      </Button>
    </div>
  );
}
