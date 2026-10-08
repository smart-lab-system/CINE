'use client';

import { useEffect, useRef, useState } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { usePreviewErrorPrice, useSetErrorPrice } from '@/hooks/useRubricErrors';
import type { OverviewCriterion, RubricErrorItem } from '@/lib/api/rubric-errors';
import { formatVnPoints } from '@/lib/format';
import { capNames, shorten } from '@/lib/rubric-board';
import { describeRecompute, formatDeductionString, parseDeductionInput } from '@/lib/rules-vocab';

/**
 * Nội dung ô nổi "Đặt / Sửa điểm trừ" của MỘT dòng áp dụng (spec D1: điểm trừ riêng từng rubric). Người gọi `key`
 * nó theo id dòng để mỗi lỗi một trạng thái riêng.
 *
 * Giữ ba bài học của bảng đặt giá cũ: (1) ô nhập luôn hiện giá trị hiện tại; (2) lỗi khi xem trước / khi lưu hiện
 * nguyên văn; (3) "đã xem trước cho giá trị nào" là một state riêng (`previewedFor`) — đổi số thì xem trước cũ mất
 * và nút lưu khoá lại, nên không bao giờ lưu theo tác động của một số khác (T-POL-5).
 */
export function PricePopover({
  item,
  rubricName,
  criterion,
  onClose,
}: {
  item: RubricErrorItem;
  rubricName: string;
  /** Tiêu chí chứa lỗi, nếu biết — chỉ để nói điểm tối đa. */
  criterion?: OverviewCriterion;
  onClose: () => void;
}) {
  const [text, setText] = useState(item.deduction === null ? '' : formatVnPoints(Number(item.deduction)));
  const [fieldError, setFieldError] = useState<string | null>(null);
  /** Số mà bản xem trước đang hiện là của số nào; `undefined` = chưa xem trước. `null` là một giá trị hợp lệ. */
  const [previewedFor, setPreviewedFor] = useState<string | null | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = usePreviewErrorPrice();
  const save = useSetErrorPrice();

  useEffect(() => inputRef.current?.focus(), []);

  const parsed = parseDeductionInput(text);
  const canSave = parsed.ok && previewedFor !== undefined && previewedFor === parsed.value && !save.isPending;
  const others = item.alsoIn.map((a) => a.rubricName);

  function runPreview() {
    if (!parsed.ok) {
      setFieldError(parsed.message);
      return;
    }
    setFieldError(null);
    if (preview.isPending || previewedFor === parsed.value) return;
    const value = parsed.value;
    preview.mutate({ rubricErrorId: item.id, deduction: value }, { onSuccess: () => setPreviewedFor(value) });
  }

  const impact = previewedFor !== undefined ? preview.data : undefined;
  const openTotal = impact?.openSessions.reduce((sum, s) => sum + s.affected, 0) ?? 0;
  const finalTotal = impact?.finalizedSessions.reduce((sum, s) => sum + s.affected, 0) ?? 0;

  function submit() {
    if (!parsed.ok) return;
    const value = parsed.value;
    save.mutate(
      { rubricErrorId: item.id, deduction: value },
      {
        onSuccess: (r) => {
          toast.success(`Đã lưu điểm trừ ${value === null ? '(để trống)' : formatDeductionString(value)}. ${describeRecompute(r.recompute)}`);
          onClose();
        },
      },
    );
  }

  return (
    <>
      <h3 className="text-body font-semibold">
        {item.deduction === null ? 'Đặt' : 'Sửa'} điểm trừ — {item.name}
      </h3>
      <p className="text-small text-muted-foreground">
        Chỉ áp cho rubric “{rubricName}”.
        {others.length > 0 && ` Ở ${capNames(others, 2)} lỗi này giữ điểm trừ riêng.`}
      </p>

      <FormField
        id={`price-${item.id}`}
        label="Điểm trừ"
        error={fieldError ?? undefined}
        hint={
          <>
            {criterion && (
              <span className="block">
                “{shorten(criterion.description)}” tối đa {formatVnPoints(criterion.maxPoints)} điểm. Điểm trừ cao hơn mức tối đa vẫn lưu được, nhưng bài chỉ bị trừ tới mức tối đa.
              </span>
            )}
            {text.trim() === '' && (
              <span className="block">
                Để trống = chưa có điểm trừ: lỗi vẫn được ghi nhận, nhưng bài dính nó không tự quyết được cho tới khi bạn đặt điểm trừ.
              </span>
            )}
          </>
        }
      >
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            id={`price-${item.id}`}
            inputMode="decimal"
            value={text}
            invalid={fieldError !== null}
            placeholder={item.deduction === null ? 'Ví dụ 1,0' : `Hiện tại ${formatVnPoints(Number(item.deduction))}`}
            onChange={(event) => {
              setText(event.target.value);
              setFieldError(null);
              setPreviewedFor(undefined);
              preview.reset();
            }}
            onBlur={runPreview}
          />
          <Button type="button" variant="outline" onClick={runPreview} disabled={preview.isPending}>
            Xem tác động
          </Button>
        </div>
      </FormField>

      {preview.isError && (
        <Alert variant="destructive">
          <AlertDescription>{preview.error?.message}</AlertDescription>
        </Alert>
      )}

      {impact && (
        <section aria-label="Lưu thì điều gì xảy ra" className="overflow-hidden rounded-lg border border-border">
          <h3 className="bg-surface-2 px-3.5 py-2 text-small font-semibold">Lưu thì điều gì xảy ra</h3>
          <div className="flex flex-col gap-2 px-3.5 py-3 text-small">
            {impact.openSessions.length === 0 && impact.finalizedSessions.length === 0 && (
              <p className="text-muted-foreground">Điểm trừ này chưa áp vào bài nào.</p>
            )}
            {impact.openSessions.length > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Đã gặp ở</span>
                  <strong className="tabular-nums">{openTotal} bài</strong>
                </div>
                {impact.openSessions.map((s) => (
                  <div key={s.sessionId} className="flex flex-col gap-0.5 pl-3">
                    <div className="flex justify-between">
                      <span>{s.name}</span>
                      <span className="tabular-nums">{s.affected} bài</span>
                    </div>
                    <span className="text-caption text-muted-foreground">{s.autoAfter} bài đủ điều kiện tự quyết sau khi lưu</span>
                    {s.blockedByOtherUnpriced > 0 && (
                      <span className="text-caption text-warning-strong">
                        {s.blockedByOtherUnpriced} bài vẫn chờ vì còn dính lỗi khác chưa có điểm trừ
                      </span>
                    )}
                  </div>
                ))}
                <p className="flex items-center gap-1.5 text-primary">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  {openTotal} bài được tính lại ngay với điểm trừ mới.
                </p>
              </>
            )}
            {impact.finalizedSessions.length > 0 && (
              <p className="flex items-start gap-1.5 rounded-md bg-surface-2 p-2.5 text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {finalTotal} bài thuộc phiên đã chốt: giữ nguyên điểm, vì bảng điểm trừ đã được ghim lúc chốt. Muốn áp điểm trừ mới cho phiên đó, dùng mục áp lại ở trang chấm điểm của phiên — mỗi bài đổi điểm có một dòng nhật ký.
                </span>
              </p>
            )}
          </div>
        </section>
      )}

      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{save.error?.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="button" variant="primary" size="sm" disabled={!canSave} loading={save.isPending} onClick={submit}>
          {impact ? `Lưu và tính lại ${openTotal} bài` : 'Lưu'}
        </Button>
      </div>
    </>
  );
}
