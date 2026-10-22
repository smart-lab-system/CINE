'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AutoTextarea } from '@/components/ui/auto-textarea';
import { Input } from '@/components/ui/input';
import { validateCase, type CaseErrors, type CaseValues, type DraftRow } from '@/lib/test-case-draft';

const lineCount = (text: string) => (text === '' ? 0 : text.split('\n').length);
const FIELD_ORDER = ['caseKey', 'group', 'expectedOutput'] as const;

/**
 * Form thêm hoặc sửa MỘT ca của bản nháp (mock-up v2). Nhãn nằm trên ô, ô bắt buộc có dấu `*`, lỗi hiện NGAY cạnh ô kèm
 * một dòng tổng kết nối tới từng ô lỗi — không chỉ đổi màu viền, vì màu một mình không mang thông điệp.
 *
 * Chưa gửi lần nào thì chưa báo lỗi (đừng mắng người đang gõ dở); đã gửi hỏng một lần thì kiểm lại sau MỖI thay đổi để lỗi
 * mất ngay khi sửa xong. Kiểm bằng `validateCase` — cùng luật với server (`TestCaseDto`), thêm luật trùng tên ca trong bản nháp.
 */
export function CaseForm({
  mode,
  initial,
  rows,
  editingIndex,
  knownGroups,
  onSubmit,
  onCancel,
}: {
  mode: 'add' | 'edit';
  initial: CaseValues;
  rows: DraftRow[];
  editingIndex: number | null;
  knownGroups: string[];
  onSubmit: (values: CaseValues, again: boolean) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const [values, setValues] = useState<CaseValues>(initial);
  const [tried, setTried] = useState(false);
  const refs = {
    caseKey: useRef<HTMLInputElement>(null),
    group: useRef<HTMLInputElement>(null),
    expectedOutput: useRef<HTMLTextAreaElement>(null),
  };

  const errors: CaseErrors = tried ? validateCase(values, rows, editingIndex) : {};
  const failed = FIELD_ORDER.filter((field) => errors[field] !== undefined);
  const id = (field: string) => `${uid}-${field}`;

  function change(patch: Partial<CaseValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  function submit(again: boolean) {
    setTried(true);
    const found = validateCase(values, rows, editingIndex);
    const first = FIELD_ORDER.find((field) => found[field] !== undefined);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    onSubmit(values, again);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit(false);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }

  const title = mode === 'add' ? 'Thêm ca mới' : `Sửa ca ${initial.caseKey}`;
  const describedBy = (field: 'caseKey' | 'group' | 'expectedOutput') => (errors[field] ? id(`${field}-err`) : id(`${field}-hint`));

  return (
    <section
      aria-labelledby={id('title')}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id={id('title')} className="text-small font-semibold">
          {title}
        </h4>
        <span className="text-caption text-muted-foreground">
          Nhãn nằm trên ô. Ô có <span className="text-danger-strong">*</span> là bắt buộc.
        </span>
      </div>

      {failed.length > 0 && (
        <div role="alert" className="rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-small font-medium text-danger-strong">
          Còn {failed.length} lỗi: {failed.map((field) => errors[field]).join(' ')}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <label htmlFor={id('caseKey')} className="text-small font-semibold">
            Tên ca <span className="text-danger-strong">*</span>
          </label>
          <Input
            ref={refs.caseKey}
            id={id('caseKey')}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
            value={values.caseKey}
            invalid={Boolean(errors.caseKey)}
            aria-describedby={describedBy('caseKey')}
            onChange={(e) => change({ caseKey: e.target.value })}
          />
          {errors.caseKey ? (
            <p id={id('caseKey-err')} className="text-caption font-medium text-danger-strong">
              {errors.caseKey}
            </p>
          ) : (
            <p id={id('caseKey-hint')} className="text-caption text-muted-foreground">
              Chữ, số, _ hoặc -. Hệ thống đề xuất tên tiếp theo.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={id('group')} className="text-small font-semibold">
            Nhóm <span className="text-danger-strong">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gợi ý nhóm">
            {knownGroups.map((group) => (
              <Button
                key={group}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={values.group.trim() === group}
                className={values.group.trim() === group ? 'border-accent bg-accent/10 text-accent-strong' : ''}
                onClick={() => change({ group })}
              >
                {group}
              </Button>
            ))}
          </div>
          <Input
            ref={refs.group}
            id={id('group')}
            placeholder="hoặc gõ nhóm mới"
            value={values.group}
            invalid={Boolean(errors.group)}
            aria-describedby={describedBy('group')}
            onChange={(e) => change({ group: e.target.value })}
          />
          {errors.group ? (
            <p id={id('group-err')} className="text-caption font-medium text-danger-strong">
              {errors.group}
            </p>
          ) : (
            <p id={id('group-hint')} className="text-caption text-muted-foreground">
              Nhóm dùng để đếm và xem theo mức ca.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor={id('input')} className="text-small font-semibold">
            Input
          </label>
          <AutoTextarea
            id={id('input')}
            rows={3}
            className="font-mono"
            value={values.input}
            aria-describedby={id('input-hint')}
            onChange={(e) => change({ input: e.target.value })}
          />
          <div className="flex justify-between gap-2">
            <p id={id('input-hint')} className="text-caption text-muted-foreground">
              Mỗi dòng là một dòng dữ liệu vào, đúng như bài đọc. Để trống nếu bài không đọc input.
            </p>
            <span className="text-caption text-muted-foreground">{lineCount(values.input)} dòng</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor={id('expectedOutput')} className="text-small font-semibold">
            Output mong đợi
          </label>
          <AutoTextarea
            ref={refs.expectedOutput}
            id={id('expectedOutput')}
            rows={2}
            className={`font-mono ${errors.expectedOutput ? 'border-danger' : ''}`}
            value={values.expectedOutput}
            aria-invalid={errors.expectedOutput ? true : undefined}
            aria-describedby={describedBy('expectedOutput')}
            onChange={(e) => change({ expectedOutput: e.target.value })}
          />
          {errors.expectedOutput ? (
            <p id={id('expectedOutput-err')} className="text-caption font-medium text-danger-strong">
              {errors.expectedOutput}
            </p>
          ) : (
            <p id={id('expectedOutput-hint')} className="text-caption text-muted-foreground">
              Đúng từng ký tự bài nộp phải in ra (khoảng trắng và xuống dòng ở cuối không tính). Để trống nếu bài không in gì, kể cả khi input là 0.
            </p>
          )}
        </div>
      </div>

      <p className="rounded-md border border-dashed border-border bg-surface px-3 py-2 text-caption text-muted-foreground">
        Sẽ hiện là: <code className="font-mono text-foreground">{values.caseKey.trim() || '…'}</code> · nhóm{' '}
        <code className="font-mono text-foreground">{values.group.trim() || '…'}</code> · {lineCount(values.input)} dòng vào · output{' '}
        <code className="font-mono text-foreground">{values.expectedOutput.trim() || '(rỗng)'}</code>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-muted-foreground">Ctrl+Enter để lưu nhanh · Esc để huỷ</span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Huỷ
          </Button>
          {mode === 'add' && (
            <Button type="button" variant="outline" size="sm" onClick={() => submit(true)}>
              Thêm và nhập tiếp
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => submit(false)}>
            {mode === 'add' ? 'Thêm vào bản nháp' : 'Lưu ca'}
          </Button>
        </div>
      </div>
    </section>
  );
}
