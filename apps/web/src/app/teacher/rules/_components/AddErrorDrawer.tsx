'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAssignError } from '@/hooks/useRubricErrors';
import type { AssignInput, RubricOverview } from '@/lib/api/rubric-errors';
import type { LibraryRule, ProposalItem } from '@/lib/api/rules';
import {
  EMPTY_ERROR_FORM,
  buildChanges,
  buildNewRule,
  detectionOf,
  validateErrorForm,
  type ErrorFormState,
} from '@/lib/error-form';
import { formatVnPoints } from '@/lib/format';
import { NO_SESSION_IMPACT, capNames, fold, impactLines, shorten } from '@/lib/rubric-board';
import { deductionLabel, describeRecompute, formatDeductionString, parseDeductionInput } from '@/lib/rules-vocab';
import { cn } from '@/lib/utils';
import { DetectionBadge } from './DetectionBadge';
import { ErrorFields } from './ErrorFields';

export interface AddErrorDrawerProps {
  overview: RubricOverview;
  /** Thư viện lỗi; chưa tải xong thì `undefined`. */
  library: LibraryRule[] | undefined;
  /** Tiêu chí chọn sẵn (mở từ một nhóm); `null` = giảng viên chọn trong ngăn kéo. */
  criterionKey: string | null;
  /** Mở từ "Lỗi AI đề xuất": tab "Tạo lỗi mới" điền sẵn; lưu thì DUYỆT đúng lỗi đó, không tạo lỗi thứ hai. */
  prefill: ProposalItem | null;
  onClose: () => void;
}

/** Điểm trừ gợi ý: của rubric khác đang dùng lỗi này (D: "Đặt điểm trừ riêng cho rubric này", sửa được). */
function suggestionOf(rule: LibraryRule): { from: string; value: string } | null {
  const use = rule.uses.find((u) => u.deduction !== null);
  return use ? { from: use.rubricName, value: use.deduction as string } : null;
}

/**
 * Ngăn kéo "Thêm lỗi" (spec mục 5.4): đầu ngăn kéo cố định **rubric › tiêu chí (điểm tối đa)**; hai đường — chọn lỗi
 * có sẵn trong thư viện (dùng lại, đặt điểm trừ riêng cho rubric này) hoặc tạo lỗi mới. Khối "Lưu thì áp vào đâu"
 * là chữ dựng từ các phiên của rubric — không gọi API.
 */
export function AddErrorDrawer({ overview, library, criterionKey, prefill, onClose }: AddErrorDrawerProps) {
  const [crit, setCrit] = useState<string | null>(criterionKey);
  const [tab, setTab] = useState<'lib' | 'new'>(prefill ? 'new' : 'lib');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [libPts, setLibPts] = useState('');
  const [form, setForm] = useState<ErrorFormState>(() =>
    prefill ? { ...EMPTY_ERROR_FORM, name: prefill.name, description: prefill.description } : EMPTY_ERROR_FORM,
  );
  const [pts, setPts] = useState('');
  const assign = useAssignError();

  const criterion = overview.criteria.find((c) => c.key === crit);
  const available = useMemo(
    () => (library ?? []).filter((r) => !r.uses.some((u) => u.rubricName === overview.rubricName)),
    [library, overview.rubricName],
  );
  const needle = fold(search.trim());
  const listed = available.filter((r) => fold(`${r.revision.name} ${r.revision.description}`).includes(needle));
  const selected = available.find((r) => r.id === selectedId) ?? null;
  const suggestion = selected ? suggestionOf(selected) : null;

  const price = parseDeductionInput(tab === 'lib' ? libPts : pts);
  let reason: string | null = null;
  if (crit === null) reason = 'Chọn tiêu chí trước';
  else if (tab === 'lib' && selected === null) reason = 'Chọn một lỗi trong danh sách';
  else if (tab === 'new' && Object.keys(validateErrorForm(form)).length > 0) reason = 'Điền tên, mô tả và cách phát hiện của lỗi';
  // Câu dài của ô điểm trừ chỉ hiện MỘT lần (dưới ô); chân ngăn kéo chỉ nhắc ngắn để không lặp lại.
  else if (!price.ok) reason = 'Sửa điểm trừ cho đúng định dạng';
  const ready = reason === null && !assign.isPending;

  const detectionNow = tab === 'lib' ? (selected ? detectionOf(selected.revision.predicate).detection : 'ai') : form.detection;
  const impact = impactLines(overview.sessions, detectionNow);

  function select(rule: LibraryRule) {
    setSelectedId(rule.id);
    const s = suggestionOf(rule);
    setLibPts(s ? formatVnPoints(Number(s.value)) : '');
  }

  function save() {
    if (!ready || crit === null || !price.ok) return;
    const base = {
      rubricName: overview.rubricName,
      criterionKey: crit,
      // Để trống = không gửi trường: không sinh phiên bản bảng điểm trừ cho một lựa chọn chưa quyết định.
      ...(price.value !== null ? { deduction: price.value } : {}),
    };
    let input: AssignInput;
    let name: string;
    if (tab === 'lib' && selected) {
      input = { ...base, ruleId: selected.id };
      name = selected.revision.name;
    } else if (prefill) {
      const changes = buildChanges({ revision: { name: prefill.name, description: prefill.description, predicate: null } }, form);
      input = { ...base, ruleId: prefill.id, ...(Object.keys(changes).length > 0 ? { changes } : {}) };
      name = form.name.trim();
    } else {
      input = { ...base, newRule: buildNewRule(form) };
      name = form.name.trim();
    }
    const where = shorten(criterion?.description ?? crit, 60);
    const value = price.value;
    assign.mutate(input, {
      onSuccess: (r) => {
        toast.success(
          `Đã thêm “${name}” vào “${where}”${value !== null ? ` (${formatDeductionString(value)})` : ' — chưa có điểm trừ'}. ${describeRecompute(r.recompute)}`,
        );
        onClose();
      },
    });
  }

  const tabButton = (id: 'lib' | 'new', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={cn('h-[34px] flex-1 rounded-[7px] text-small font-semibold', tab === id ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground')}
    >
      {label}
    </button>
  );

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="flex w-full max-w-[560px] flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border p-6 pb-4">
          <SheetTitle>Thêm lỗi</SheetTitle>
          <div className="mt-2 flex flex-col gap-1.5 rounded-lg bg-primary-subtle px-3.5 py-2.5 text-small text-primary">
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              <span>Rubric: {overview.rubricName}</span>
              <span aria-hidden="true">›</span>
              {criterion ? (
                <span>
                  Tiêu chí: {shorten(criterion.description, 60)} · tối đa {formatVnPoints(criterion.maxPoints)}
                </span>
              ) : (
                <>
                  <label className="sr-only" htmlFor="add-crit">
                    Tiêu chí
                  </label>
                  <select
                    id="add-crit"
                    value={crit ?? ''}
                    onChange={(e) => setCrit(e.target.value || null)}
                    className="h-[30px] rounded-md border border-primary/30 bg-surface px-2 font-semibold text-primary"
                  >
                    <option value="">Chọn tiêu chí…</option>
                    {overview.criteria.map((c) => (
                      <option key={c.key} value={c.key}>
                        {shorten(c.description, 50)} · tối đa {formatVnPoints(c.maxPoints)}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <span className="font-normal">Lỗi bạn thêm ở đây chỉ nằm trong rubric này.</span>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          <div role="tablist" aria-label="Cách thêm" className="flex gap-1 rounded-lg bg-surface-2 p-1">
            {tabButton('lib', `Chọn lỗi có sẵn (${available.length})`)}
            {tabButton('new', 'Tạo lỗi mới')}
          </div>

          {tab === 'lib' ? (
            <>
              <Input aria-label="Tìm lỗi" placeholder={`Tìm trong ${available.length} lỗi chưa dùng ở rubric này`} value={search} onChange={(e) => setSearch(e.target.value)} />
              {available.length === 0 ? (
                <p className="text-muted-foreground">Mọi lỗi trong thư viện đã có ở rubric này. Hãy tạo lỗi mới.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {listed.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={selectedId === r.id}
                      onClick={() => select(r)}
                      className={cn(
                        'flex flex-col gap-1.5 rounded-lg border bg-surface p-3 text-left',
                        selectedId === r.id ? 'border-primary ring-2 ring-primary-subtle' : 'border-border hover:bg-background',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <b className="font-semibold">{r.revision.name}</b>
                        <DetectionBadge predicate={r.revision.predicate} />
                      </span>
                      <span className="text-small text-muted-foreground">{r.revision.description}</span>
                      <span className="text-small text-muted-foreground">
                        {r.uses.length > 0
                          ? `Đang dùng ở: ${capNames(r.uses.map((u) => `${u.rubricName} (${deductionLabel(u.deduction)})`), 2)}`
                          : 'Chưa dùng ở rubric nào'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {selected && (
                <FormField
                  id="add-lib-price"
                  label="Điểm trừ cho rubric này"
                  error={price.ok ? undefined : price.message}
                  hint={
                    suggestion
                      ? `Gợi ý từ ${suggestion.from}: ${formatVnPoints(Number(suggestion.value))}. Sửa tuỳ ý.`
                      : 'Để trống nếu chưa quyết định; bài dính lỗi này sẽ chưa tự duyệt được.'
                  }
                >
                  <Input id="add-lib-price" inputMode="decimal" className="w-28 text-right font-bold" placeholder="0,0" value={libPts} invalid={!price.ok} onChange={(e) => setLibPts(e.target.value)} />
                </FormField>
              )}
            </>
          ) : (
            <>
              <ErrorFields form={form} onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} idPrefix="add" />
              <FormField
                id="add-new-price"
                label="Điểm trừ cho rubric này"
                error={price.ok ? undefined : price.message}
                hint={
                  criterion
                    ? `“${shorten(criterion.description, 40)}” tối đa ${formatVnPoints(criterion.maxPoints)} điểm. Để trống nếu chưa quyết định; bài dính lỗi này sẽ chưa tự duyệt được.`
                    : 'Chọn tiêu chí ở trên để biết điểm tối đa.'
                }
              >
                <Input id="add-new-price" inputMode="decimal" className="w-28 text-right font-bold" placeholder="1,0" value={pts} invalid={!price.ok} onChange={(e) => setPts(e.target.value)} />
              </FormField>
            </>
          )}

          <section aria-label="Lưu thì áp vào đâu" className="overflow-hidden rounded-lg border border-border">
            <h3 className="bg-surface-2 px-3.5 py-2 text-small font-semibold">Lưu thì áp vào đâu</h3>
            <div className="px-3.5 py-3 text-small">
              {impact.length === 0 ? (
                <p className="text-muted-foreground">{NO_SESSION_IMPACT}</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2.5">
                    {impact.map((line) => (
                      <li key={line.sessionId}>
                        <b className="font-semibold">{line.name}</b>
                        {line.state === 'finalized' && <span className="ml-1.5 rounded-full bg-surface-2 px-2 py-px text-caption font-semibold text-muted-foreground">đã chốt</span>}
                        {line.state === 'grading' && <span className="ml-1.5 rounded-full bg-primary-subtle px-2 py-px text-caption font-semibold text-primary">đang chấm</span>}
                        <br />
                        <span className="text-muted-foreground">{line.text}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2.5 text-muted-foreground">Rubric khác không bị ảnh hưởng.</p>
                </>
              )}
            </div>
          </section>

          {assign.isError && (
            <Alert variant="destructive">
              <AlertDescription>{assign.error?.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border p-4">
          {reason && <span className="mr-auto text-small text-muted-foreground">{reason}</span>}
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="button" variant="primary" disabled={!ready} loading={assign.isPending} title={reason ?? undefined} onClick={save}>
            {tab === 'lib' ? 'Thêm vào tiêu chí' : 'Tạo và thêm vào tiêu chí'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
