'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useReviseRule, useSplitRule } from '@/hooks/useRules';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import type { LibraryRule } from '@/lib/api/rules';
import { buildChanges, detectionOf, formFromRule, validateErrorForm, type ErrorFormState } from '@/lib/error-form';
import { capNames, scopeLine, shorten } from '@/lib/rubric-board';
import { deductionLabel, describeRecompute } from '@/lib/rules-vocab';
import { ErrorFields } from './ErrorFields';

const CHIPS = 4;

/**
 * Ngăn kéo "Sửa lỗi" (spec mục 5.5, D4). Chỉ sửa NỘI DUNG lỗi (tên, mô tả, cách phát hiện) — tiêu chí và điểm trừ
 * mỗi rubric một khác nên không sửa ở đây. Lỗi đang dùng ở ≥ 2 rubric: giảng viên chọn phạm vi bằng hai nút, mỗi nút
 * kèm một dòng hệ quả bằng tên rubric và phiên thật. Mở từ Thư viện thì chỉ có "Lưu cho cả N rubric".
 */
export function EditErrorDrawer({
  rule,
  loading,
  fromRubric,
  overviews,
  onClose,
}: {
  rule: LibraryRule | undefined;
  /** Thư viện chưa tải xong. */
  loading: boolean;
  /** Rubric mà giảng viên mở ngăn kéo từ đó; `null` = từ Thư viện lỗi. */
  fromRubric: string | null;
  overviews: RubricOverview[];
  onClose: () => void;
}) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="flex w-full max-w-[560px] flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border p-6 pb-4">
          <SheetTitle>Sửa lỗi</SheetTitle>
        </SheetHeader>
        {rule ? (
          <EditBody key={rule.id} rule={rule} fromRubric={fromRubric} overviews={overviews} onClose={onClose} />
        ) : (
          <p className="p-6 text-muted-foreground">{loading ? 'Đang tải…' : 'Không tìm thấy lỗi này — có thể nó đã bị bỏ.'}</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditBody({
  rule,
  fromRubric,
  overviews,
  onClose,
}: {
  rule: LibraryRule;
  fromRubric: string | null;
  overviews: RubricOverview[];
  onClose: () => void;
}) {
  const orig = formFromRule(rule);
  const [form, setForm] = useState<ErrorFormState>(orig);
  const revise = useReviseRule();
  const split = useSplitRule();

  const used = [...new Set(rule.uses.map((u) => u.rubricName))];
  const n = used.length;
  const here = fromRubric !== null && used.includes(fromRubric) ? fromRubric : null;
  const changes = buildChanges(rule, form);
  const valid = Object.keys(validateErrorForm(form)).length === 0;
  const ok = Object.keys(changes).length > 0 && valid;
  const sessionsOf = (names: string[]) => overviews.filter((o) => names.includes(o.rubricName)).flatMap((o) => o.sessions);
  const criterionTitle = (rubricName: string, key: string) =>
    shorten(overviews.find((o) => o.rubricName === rubricName)?.criteria.find((c) => c.key === key)?.description ?? 'tiêu chí đã xoá', 30);
  const name = form.name.trim() || orig.name;
  const error = revise.error ?? split.error;

  function saveAll() {
    revise.mutate(
      { ruleId: rule.id, changes },
      {
        onSuccess: (r) => {
          toast.success(`${n > 1 ? `Đã lưu “${name}” cho cả ${n} rubric.` : `Đã lưu “${name}”.`} ${describeRecompute(r.recompute)}`);
          onClose();
        },
      },
    );
  }

  function saveOne() {
    if (here === null) return;
    split.mutate(
      { ruleId: rule.id, rubricName: here, changes },
      {
        onSuccess: (r) => {
          toast.success(`Đã tách bản riêng của “${name}” cho “${here}”. ${n - 1} rubric còn lại giữ nguyên bản cũ. ${describeRecompute(r.recompute)}`);
          onClose();
        },
      },
    );
  }

  const pending = revise.isPending || split.isPending;
  const hint = <span className="text-small text-muted-foreground">{ok ? '' : 'Chưa có thay đổi để lưu.'}</span>;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex flex-col gap-1.5 rounded-lg bg-primary-subtle px-3.5 py-2.5 text-small text-primary">
          <span className="font-semibold">{orig.name}</span>
          <div className="flex flex-wrap gap-1.5">
            {rule.uses.slice(0, CHIPS).map((u) => (
              <Badge key={u.rubricName}>
                {u.rubricName} · {criterionTitle(u.rubricName, u.criterionKey)} · {deductionLabel(u.deduction)}
              </Badge>
            ))}
            {rule.uses.length > CHIPS && <Badge>+{rule.uses.length - CHIPS} nơi dùng khác</Badge>}
            {rule.uses.length === 0 && <span>Chưa dùng ở rubric nào</span>}
          </div>
          <span className="font-normal">
            {here ? `Bạn đang mở từ rubric “${here}”.` : 'Bạn đang mở từ Thư viện lỗi.'} Tiêu chí và điểm trừ không sửa ở đây — mỗi rubric một khác; bấm số điểm trừ ở dòng lỗi để đổi.
          </span>
        </div>

        <ErrorFields form={form} onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} idPrefix="edit" legacyNote={detectionOf(rule.revision.predicate).legacyNote} />

        {n > 1 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <h3 className="bg-surface-2 px-3.5 py-2 text-small font-semibold">Áp dụng thay đổi cho</h3>
            <div className="flex flex-col gap-0.5 border-t border-border px-3.5 py-3 text-small">
              <b className="font-semibold">Cả {n} rubric</b>
              <span className="text-muted-foreground">{capNames(used, 3)}</span>
              <span className="mt-1">{scopeLine(sessionsOf(used), form.detection)}</span>
            </div>
            <div className="flex flex-col gap-0.5 border-t border-border px-3.5 py-3 text-small">
              {here ? (
                <>
                  <b className="font-semibold">Chỉ “{here}”</b>
                  <span className="text-muted-foreground">
                    Tách thành bản riêng cho rubric này, {n - 1} rubric còn lại giữ nguyên bản cũ “{orig.name}”. {scopeLine(sessionsOf([here]), form.detection)}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Muốn đổi riêng một rubric: mở rubric đó, bấm ⋯ ở dòng lỗi rồi chọn Sửa.</span>
              )}
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
      </div>

      {n > 1 && here ? (
        <div className="grid grid-cols-[auto_1fr_1fr] items-start gap-x-3 gap-y-2 border-t border-border p-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <div className="flex flex-col gap-1.5 text-center">
            <Button type="button" variant="outline" className="h-auto min-h-9 w-full whitespace-normal border-primary text-primary" disabled={!ok || pending} loading={revise.isPending} onClick={saveAll}>
              Lưu cho cả {n} rubric
            </Button>
            <p className="text-caption text-muted-foreground">Đổi ở {capNames(used, 2)}.</p>
          </div>
          <div className="flex flex-col gap-1.5 text-center">
            <Button type="button" variant="primary" className="h-auto min-h-9 w-full whitespace-normal" disabled={!ok || pending} loading={split.isPending} onClick={saveOne}>
              Chỉ lưu cho “{here}”
            </Button>
            <p className="text-caption text-muted-foreground">Tách bản riêng; {capNames(used.filter((r) => r !== here), 2)} giữ bản cũ.</p>
          </div>
          <div className="col-span-3">{hint}</div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2.5 border-t border-border p-4">
          <span className="mr-auto">{hint}</span>
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="button" variant="primary" disabled={!ok || pending} loading={revise.isPending} onClick={saveAll}>
            {n > 1 ? `Lưu cho cả ${n} rubric` : 'Lưu'}
          </Button>
        </div>
      )}
    </>
  );
}
