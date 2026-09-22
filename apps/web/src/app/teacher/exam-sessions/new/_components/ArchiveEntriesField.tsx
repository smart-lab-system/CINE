'use client';

import { useEffect } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { CircleAlert, Info, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CreateExamSessionFormValues } from '../schema';

/** Phải khớp ARCHIVE_EXTENSIONS trong schema.ts và trong
 *  apps/api/src/exam-session/dto/create-exam-session.dto.ts. */
const ARCHIVE_EXTENSIONS = ['.zip', '.rar'] as const;

function isArchiveFilename(value: string): boolean {
  const lower = value.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Khối "Kiểm file bên trong (tuỳ chọn)", gắn dưới MỘT dòng file bắt buộc
 * trong `RequiredFilenamesInput` — một khối cho mỗi `index` của
 * `requiredFilenames`. Chỉ nghĩa khi bản thân dòng đó là `.zip`/`.rar`
 * (spec 2026-09-21-archive-content-validation-design.md §9.1).
 *
 * Hiện/ẩn theo chính giá trị đang gõ, không theo một cờ bật/tắt riêng —
 * cùng lý lẽ `filename-template.ts` phía backend đã viết cho chính nó:
 * một cờ là một sự thật thứ hai có thể lệch khỏi cái tên.
 */
export function ArchiveEntriesField({ index }: { index: number }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<CreateExamSessionFormValues>();

  const filename = useWatch({ control, name: `requiredFilenames.${index}.value` }) ?? '';
  const isArchive = isArchiveFilename(filename);

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: `requiredFilenames.${index}.entries`,
  });

  // Gõ lại thành KHÔNG PHẢI .zip/.rar thì XOÁ entries đã nhập — không giữ
  // ngầm. Giữ lại sẽ gửi lên một danh sách mà DTO backend từ chối
  // (EntriesOnlyOnArchiveConstraint), và người dùng không hiểu vì sao form
  // báo lỗi ở một trường họ không còn nhìn thấy (spec §9.1).
  useEffect(() => {
    if (!isArchive && fields.length > 0) {
      replace([]);
    }
  }, [isArchive, fields.length]);

  if (!isArchive) {
    return null;
  }

  // Lỗi ở tầng "cả danh sách entries" (quá trần .max(), trùng tên, hoặc
  // khai trên deliverable không phải archive) — KHÔNG phải lỗi từng dòng.
  // Xem doc comment §6.3 của archive-check.e2e-spec.ts cho hình dạng lỗi
  // zodResolver thật sự trả về: message nằm trực tiếp trên node `entries`.
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
          Chưa khai file nào — nộp đúng tên <code className="font-mono">{filename}</code> là
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
                  {`File bên trong số ${entryIndex + 1} của ${filename}`}
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
