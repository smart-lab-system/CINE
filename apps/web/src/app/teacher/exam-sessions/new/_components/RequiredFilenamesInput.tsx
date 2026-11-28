'use client';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_ARCHIVE_DELIVERABLE,
  type ReplaceRequiredDeliverablesFormValues,
} from '../schema';
import { ArchiveEntriesField } from './ArchiveEntriesField';
import {
  FILENAME_TOKENS,
  isTemplatedFilename,
  previewFilenamePattern,
} from './filename-pattern-preview';

const DELIVERABLE_TYPE_LABELS = {
  document: 'Tài liệu',
  code_project: 'Mã nguồn',
  image: 'Ảnh chụp',
} as const;

/**
 * Loại mã nguồn giảng viên chọn trên dòng gói. `language` chỉ gửi khi
 * backend có giá trị đó (`python`/`cpp` chạy được, `java` khai được nhưng
 * chấm bằng đọc mã). C, Jupyter, JSON chỉ đổi đuôi file - không có cột ngôn ngữ.
 */
const SOURCE_KINDS = [
  { id: 'python', label: 'Python', extension: '.py', language: 'python' },
  { id: 'cpp', label: 'C++', extension: '.cpp', language: 'cpp' },
  { id: 'c', label: 'C', extension: '.c' },
  { id: 'java', label: 'Java', extension: '.java', language: 'java' },
  { id: 'ipynb', label: 'Jupyter', extension: '.ipynb' },
  { id: 'json', label: 'JSON', extension: '.json' },
] as const;

type SourceKind = (typeof SOURCE_KINDS)[number];

const ARCHIVE_OUTER = ['.zip', '.rar'] as const;

function sourceKindOf(filename: string): SourceKind | undefined {
  const lower = filename.toLowerCase();
  return [...SOURCE_KINDS]
    .sort((a, b) => b.extension.length - a.extension.length)
    .find((kind) => lower.endsWith(kind.extension));
}

/**
 * Đổi đuôi theo loại mã nguồn vừa chọn. Gói nén (.zip/.rar) giữ nguyên tên
 * ngoài - loại mã nguồn chỉ gắn metadata chấm, không đổi vỏ gói.
 */
export function applySourceExtension(filename: string, extension: string): string {
  const trimmed = filename.trim();
  const lower = trimmed.toLowerCase();
  if (ARCHIVE_OUTER.some((ext) => lower.endsWith(ext))) return trimmed;
  const stem = trimmed.replace(/\.[A-Za-z0-9]+$/, '');
  return `${stem.length > 0 ? stem : 'bai'}${extension}`;
}

const SELECT_CLASS =
  'h-10 rounded-md border border-input bg-surface px-2 text-small text-foreground shadow-sm focus:border-accent focus:outline-none';

/**
 * Archive deliverable: lúc nộp, agent tự đóng gói workspace (ignore
 * node_modules/target/…). `.zip` tạo placeholder EOCD lúc vào phòng;
 * `.rar` cần WinRAR trên máy lab để agent đóng được - GV cần biết lúc khai.
 */
function isRarFilename(value: string): boolean {
  return value.toLowerCase().endsWith('.rar');
}

/**
 * Đúng một gói nộp `.zip`|`.rar` trên hub Thư mục bài làm
 * (spec 2026-11-28-single-archive-deliverable-design.md).
 */
export function RequiredFilenamesInput() {
  const {
    control,
    register,
    setValue,
    formState: { errors },
  } = useFormContext<ReplaceRequiredDeliverablesFormValues>();

  const { fields } = useFieldArray({
    control,
    name: 'requiredFilenames',
  });

  // Hub luôn đúng 1 dòng; nếu state lệch (draft cũ) vẫn render dòng đầu.
  const index = 0;
  const field = fields[index];
  const listError = errors.requiredFilenames?.message ?? errors.requiredFilenames?.root?.message;

  const values = useWatch({ control, name: 'requiredFilenames' });
  const currentValue = values?.[index]?.value ?? '';

  function insertToken(token: string) {
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
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function chooseSourceKind(kindId: string) {
    const kind = SOURCE_KINDS.find((item) => item.id === kindId);
    const current = values?.[index]?.value ?? '';
    if (!kind) {
      setValue(`requiredFilenames.${index}.language`, undefined, {
        shouldDirty: true,
        shouldValidate: true,
      });
      return;
    }
    setValue(`requiredFilenames.${index}.value`, applySourceExtension(current, kind.extension), {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(
      `requiredFilenames.${index}.language`,
      'language' in kind ? kind.language : undefined,
      { shouldDirty: true, shouldValidate: true },
    );
  }

  if (!field) {
    return null;
  }

  const fieldError = errors.requiredFilenames?.[index]?.value;

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/60 p-4">
      <legend className="px-1 text-body font-semibold text-foreground">Gói bài nộp</legend>

      <p className="text-small text-muted-foreground">
        Mỗi phiên chỉ một gói <code className="font-mono">.zip</code> hoặc{' '}
        <code className="font-mono">.rar</code>. Lúc thu bài, agent tự đóng thư mục làm bài vào
        gói này (bỏ <code className="font-mono">node_modules</code>,{' '}
        <code className="font-mono">target</code>, …). Chỉ dùng chữ, số,{' '}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-caption">_</code>{' '}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-caption">-</code>{' '}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-caption">.</code>
      </p>

      <p className="text-small text-muted-foreground">
        Mặc định{' '}
        <code className="font-mono">{DEFAULT_ARCHIVE_DELIVERABLE}</code>. Chèn ô dưới đây nếu
        muốn đổi mẫu - máy chủ tự điền.{' '}
        <code className="font-mono">{'{HOTEN}'}</code> từ danh sách lớp (bỏ dấu tiếng Việt).{' '}
        <code className="font-mono">{'{SOMAY}'}</code> từ Vị trí máy trong danh sách máy tính; nếu
        trống thì dùng mã phòng + hostname.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`required-filename-${index}`} className="sr-only">
          Tên gói nộp
        </Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-muted-foreground">Chèn:</span>
          {FILENAME_TOKENS.map(({ token, label }) => (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              className="rounded border border-border bg-surface px-2 py-0.5 font-mono text-caption text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {token}
              <span className="sr-only"> - {label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            id={`required-filename-${index}`}
            placeholder={DEFAULT_ARCHIVE_DELIVERABLE}
            className="font-mono"
            invalid={Boolean(fieldError)}
            {...register(`requiredFilenames.${index}.value` as const)}
          />
          <Label htmlFor={`required-deliverable-type-${index}`} className="sr-only">
            Loại bài nộp
          </Label>
          <select
            id={`required-deliverable-type-${index}`}
            className={SELECT_CLASS}
            {...register(`requiredFilenames.${index}.deliverableType` as const, {
              onChange: (event) => {
                if (event.target.value === 'code_project') return;
                setValue(`requiredFilenames.${index}.language`, undefined, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              },
            })}
          >
            {Object.entries(DELIVERABLE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {values?.[index]?.deliverableType === 'code_project' && (
            <>
              <Label htmlFor={`required-language-${index}`} className="sr-only">
                Loại mã nguồn
              </Label>
              <select
                id={`required-language-${index}`}
                className={SELECT_CLASS}
                value={
                  sourceKindOf(currentValue)?.id ??
                  (values?.[index]?.language === 'python' ||
                  values?.[index]?.language === 'cpp' ||
                  values?.[index]?.language === 'java'
                    ? values[index].language
                    : '')
                }
                onChange={(event) => chooseSourceKind(event.target.value)}
              >
                <option value="">Chọn loại</option>
                {SOURCE_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </>
          )}
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
          isTemplatedFilename(currentValue) && (
            <p className="text-caption text-muted-foreground">
              Ví dụ với một sinh viên:{' '}
              <code className="font-mono text-foreground">
                {previewFilenamePattern(currentValue)}
              </code>
            </p>
          )
        )}
        {(() => {
          const kind = sourceKindOf(currentValue);
          const runnable =
            kind !== undefined &&
            'language' in kind &&
            (kind.language === 'python' || kind.language === 'cpp');
          if (!kind || values?.[index]?.deliverableType !== 'code_project' || runnable) {
            return null;
          }
          return (
            <p className="text-caption text-muted-foreground">
              Loại này được thu như mã nguồn. Chấm bằng chạy code chỉ có với Python và C++.
            </p>
          );
        })()}
        {isRarFilename(currentValue) && (
          <Alert variant="warning" className="py-2">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="text-caption">
              Agent tự đóng gói bài nộp .rar lúc thu bài - máy thi PHẢI có WinRAR (Rar.exe). Cân
              nhắc đổi sang <code className="font-mono">.zip</code> (không cần WinRAR), hoặc xác
              nhận phòng máy đã cài WinRAR trước khi thi.
            </AlertDescription>
          </Alert>
        )}
        <ArchiveEntriesField index={index} />
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
    </fieldset>
  );
}
