'use client';

import { useState } from 'react';
import { AutoTextarea } from '@/components/ui/auto-textarea';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { validateErrorForm, type ErrorFormState } from '@/lib/error-form';
import { cn } from '@/lib/utils';

type Field = 'name' | 'description' | 'group';

const OPTIONS: { id: ErrorFormState['detection']; title: string; text: string }[] = [
  { id: 'auto', title: 'Tự động (chạy test)', text: 'Chọn một nhóm test; bài trượt nhóm đó thì bị lỗi. Chắc chắn, không cần bạn xem.' },
  { id: 'ai', title: 'AI đọc bài', text: 'AI đọc mã và kết luận theo mô tả ở trên. Mô tả càng cụ thể, AI càng ít nhầm.' },
];

/**
 * Bốn trường của một lỗi (tên, mô tả, cách phát hiện, nhóm test) dùng chung cho ngăn kéo "Thêm lỗi" và "Sửa lỗi".
 * Thông báo kiểm tra chỉ hiện sau khi giảng viên đã rời ô đó — không mắng người chưa kịp gõ.
 */
export function ErrorFields({
  form,
  onChange,
  idPrefix,
  legacyNote,
}: {
  form: ErrorFormState;
  onChange: (patch: Partial<ErrorFormState>) => void;
  idPrefix: string;
  /** Lỗi cũ mang điều kiện ngoài "nhóm test": hiện một dòng ghi chú dưới ô cách phát hiện. */
  legacyNote?: string | null;
}) {
  const [touched, setTouched] = useState<ReadonlySet<Field>>(new Set());
  const errors = validateErrorForm(form);
  const shown = (field: Field) => (touched.has(field) ? errors[field] : undefined);
  const touch = (field: Field) => setTouched((prev) => new Set(prev).add(field));

  return (
    <>
      <FormField id={`${idPrefix}-name`} label="Tên lỗi" error={shown('name')}>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          invalid={shown('name') !== undefined}
          placeholder="Ví dụ: Quên giải phóng nút đầu danh sách"
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={() => touch('name')}
        />
      </FormField>

      <FormField
        id={`${idPrefix}-description`}
        label="Mô tả lỗi"
        error={shown('description')}
        hint="Viết sao cho giảng viên khác và AI hiểu cùng một nghĩa."
      >
        <AutoTextarea
          id={`${idPrefix}-description`}
          rows={3}
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          onBlur={() => touch('description')}
        />
      </FormField>

      <div role="group" aria-labelledby={`${idPrefix}-detection`} className="flex flex-col gap-2">
        <span id={`${idPrefix}-detection`} className="text-small font-medium">
          Cách phát hiện
        </span>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={form.detection === o.id}
              onClick={() => onChange({ detection: o.id })}
              className={cn(
                'flex flex-col gap-1 rounded-lg border p-3 text-left',
                form.detection === o.id ? 'border-primary bg-primary-subtle' : 'border-border bg-surface hover:bg-surface-2',
              )}
            >
              <b className="text-small font-semibold">{o.title}</b>
              <span className="text-caption text-muted-foreground">{o.text}</span>
            </button>
          ))}
        </div>
        {form.detection === 'ai' && legacyNote && (
          <p className="text-small text-muted-foreground">
            Điều kiện cũ: {legacyNote}. Hệ thống vẫn dùng điều kiện đó khi AI đọc bài; sửa tên hoặc mô tả không đổi điều kiện này.
          </p>
        )}
      </div>

      {form.detection === 'auto' && (
        <FormField id={`${idPrefix}-group`} label="Tên nhóm test" error={shown('group')}>
          <Input
            id={`${idPrefix}-group`}
            className="font-mono"
            value={form.group}
            invalid={shown('group') !== undefined}
            placeholder="vd: bien, mang_rong"
            onChange={(e) => onChange({ group: e.target.value })}
            onBlur={() => touch('group')}
          />
        </FormField>
      )}
    </>
  );
}
