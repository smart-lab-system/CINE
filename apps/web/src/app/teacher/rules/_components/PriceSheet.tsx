'use client';

import { useState } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { usePreviewPrice, useSetPrice } from '@/hooks/useRules';
import { formatVnPoints } from '@/lib/format';
import { parseDeductionInput } from '@/lib/rules-vocab';
import type { Rule } from '@/lib/api/rules';

/**
 * Bảng đặt giá (spec §3.1, luật 4 và 7) — mở bên phải, không rời trang.
 *
 * Ba lỗi của `PriceEditDialog` cũ mà bảng này sửa:
 * 1. Dialog luôn được mount, `useState(rule?.deduction)` chỉ chạy một lần lúc rule còn `null` → ô nhập
 *    không bao giờ hiện giá hiện tại và trạng thái rò sang luật khác. Ở đây thân bảng được `key` theo
 *    `rule.id`, nên mỗi luật một trạng thái riêng.
 * 2. Lỗi khi lưu / khi xem trước không hiện ở đâu cả.
 * 3. Xem trước của con số CŨ vẫn có thể bật nút lưu sau khi đổi số. Ở đây "đã xem trước cho giá nào"
 *    là một state riêng (`previewedFor`), so với giá hiện tại trước khi cho lưu.
 */
export function PriceSheet({
  rule,
  onClose,
  ceiling,
}: {
  rule: Rule | null;
  onClose: () => void;
  /** Trần điểm của tiêu chí luật này trỏ vào, nếu biết — chỉ để nói cho giảng viên biết. */
  ceiling?: { label: string; max: number };
}) {
  if (!rule) return null;
  return <PriceSheetBody key={rule.id} rule={rule} onClose={onClose} ceiling={ceiling} />;
}

function PriceSheetBody({
  rule,
  onClose,
  ceiling,
}: {
  rule: Rule;
  onClose: () => void;
  ceiling?: { label: string; max: number };
}) {
  const [text, setText] = useState(rule.deduction === null ? '' : formatVnPoints(Number(rule.deduction)));
  const [fieldError, setFieldError] = useState<string | null>(null);
  /** Giá mà bản xem trước đang hiện là của giá nào; `undefined` = chưa xem trước. `null` là một giá hợp lệ (chưa có giá). */
  const [previewedFor, setPreviewedFor] = useState<string | null | undefined>(undefined);
  const preview = usePreviewPrice();
  const save = useSetPrice();

  const parsed = parseDeductionInput(text);
  const canSave = parsed.ok && previewedFor !== undefined && previewedFor === parsed.value && !save.isPending;

  function runPreview() {
    if (!parsed.ok) {
      setFieldError(parsed.message);
      return;
    }
    setFieldError(null);
    if (preview.isPending || previewedFor === parsed.value) return;
    const value = parsed.value;
    preview.mutate({ ruleId: rule.id, deduction: value }, { onSuccess: () => setPreviewedFor(value) });
  }

  const impact = previewedFor !== undefined ? preview.data : undefined;
  const openTotal = impact?.openSessions.reduce((sum, s) => sum + s.affected, 0) ?? 0;
  const finalTotal = impact?.finalizedSessions.reduce((sum, s) => sum + s.affected, 0) ?? 0;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="flex w-full max-w-[460px] flex-col gap-5 overflow-y-auto">
        <SheetHeader>
          <span className="text-caption font-semibold text-muted-foreground">
            {rule.deduction === null ? 'Đặt giá lần đầu' : 'Sửa giá'}
          </span>
          <SheetTitle>{rule.revision.name}</SheetTitle>
          <p className="font-mono text-caption text-muted-foreground">{rule.ruleKey}</p>
        </SheetHeader>

        <FormField
          id="price-input"
          label="Mức trừ (điểm)"
          error={fieldError ?? undefined}
          hint={
            <>
              {ceiling && (
                <span className="block">
                  Trần tiêu chí {ceiling.label}: {formatVnPoints(ceiling.max)} điểm. Giá cao hơn trần vẫn lưu được, nhưng bài
                  chỉ bị trừ tới trần.
                </span>
              )}
              {text.trim() === '' && (
                <span className="block">
                  Để trống = chưa có giá: luật vẫn tồn tại, agent vẫn nhận ra lỗi, nhưng bài dính nó không tự quyết được
                  cho tới khi bạn đặt giá.
                </span>
              )}
            </>
          }
        >
          <div className="flex items-center gap-2">
            <Input
              id="price-input"
              inputMode="decimal"
              value={text}
              invalid={fieldError !== null}
              placeholder={rule.deduction === null ? 'Ví dụ 1,0' : `Hiện tại ${formatVnPoints(Number(rule.deduction))}`}
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
            <AlertDescription>{preview.error.message}</AlertDescription>
          </Alert>
        )}

        {impact && (
          <section aria-label="Lưu thì điều gì xảy ra" className="overflow-hidden rounded-lg border border-border">
            <h3 className="bg-surface-2 px-3.5 py-2.5 text-small font-semibold">Lưu thì điều gì xảy ra</h3>
            <div className="flex flex-col gap-2 px-3.5 py-3 text-small">
              {impact.openSessions.length === 0 && impact.finalizedSessions.length === 0 && (
                <p className="text-muted-foreground">Giá này chưa áp vào bài nào.</p>
              )}
              {impact.openSessions.length > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Đang áp vào</span>
                    <strong className="tabular-nums">{openTotal} bài</strong>
                  </div>
                  {impact.openSessions.map((s) => (
                    <div key={s.sessionId} className="flex flex-col gap-0.5 pl-3">
                      <div className="flex justify-between">
                        <span>{s.name}</span>
                        <span className="tabular-nums">{s.affected} bài</span>
                      </div>
                      <span className="text-caption text-muted-foreground">
                        {s.autoAfter} bài đủ điều kiện tự quyết sau khi lưu
                      </span>
                      {s.blockedByOtherUnpriced > 0 && (
                        <span className="text-caption text-warning-strong">
                          {s.blockedByOtherUnpriced} bài vẫn chờ vì còn dính luật khác chưa có giá
                        </span>
                      )}
                    </div>
                  ))}
                  <p className="flex items-center gap-1.5 text-accent-strong">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {openTotal} bài được tính lại ngay với giá mới.
                  </p>
                </>
              )}
              {impact.finalizedSessions.length > 0 && (
                <p className="flex items-start gap-1.5 rounded-md bg-surface-2 p-2.5 text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {finalTotal} bài thuộc phiên đã chốt: giữ nguyên điểm, vì bảng giá đã ghim lúc chốt. Muốn áp giá mới cho
                    phiên đó, bấm &quot;Áp giá mới cho phiên đã chốt&quot; ở trang phiên — mỗi bài đổi điểm sẽ có một dòng
                    nhật ký.
                  </span>
                </p>
              )}
            </div>
          </section>
        )}

        {save.isError && (
          <Alert variant="destructive">
            <AlertDescription>{save.error.message}</AlertDescription>
          </Alert>
        )}

        <div className="mt-auto flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            loading={save.isPending}
            onClick={() => {
              if (!parsed.ok) return;
              save.mutate({ ruleId: rule.id, deduction: parsed.value }, { onSuccess: onClose });
            }}
          >
            {impact ? `Lưu và tính lại ${openTotal} bài` : 'Lưu giá'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
