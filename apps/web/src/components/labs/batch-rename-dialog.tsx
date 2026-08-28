'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  buildBatchRenameItems,
  formatSequentialValue,
  sortWorkstationsByCurrentOrder,
  type BatchRenameItem,
  type BatchRenameTarget,
} from './batch-rename-utils';

type WorkstationOption = {
  id: string;
  assetCode: string;
  hostname: string;
};

export function BatchRenameDialog({
  open,
  workstations,
  defaultPrefix,
  isSubmitting,
  errorMessage,
  onClose,
  onApply,
}: {
  open: boolean;
  workstations: WorkstationOption[];
  defaultPrefix?: string;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onApply: (items: BatchRenameItem[]) => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [prefix, setPrefix] = useState(defaultPrefix ?? '');
  const [target, setTarget] = useState<BatchRenameTarget>('both');
  const [startIndex, setStartIndex] = useState('1');
  const [paddingDigits, setPaddingDigits] = useState('2');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPrefix(defaultPrefix ?? '');
    setTarget('both');
    setStartIndex('1');
    setPaddingDigits('2');
    setFormError(null);
  }, [open, defaultPrefix]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || isSubmitting) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, isSubmitting, onClose]);

  const start = Number.parseInt(startIndex, 10);
  const pad = Number.parseInt(paddingDigits, 10);
  const ordered = useMemo(
    () => sortWorkstationsByCurrentOrder(workstations),
    [workstations],
  );

  const preview = useMemo(() => {
    if (!Number.isInteger(start) || !Number.isInteger(pad) || pad < 1) {
      return [];
    }
    return ordered.map((ws, i) => ({
      id: ws.id,
      currentAsset: ws.assetCode,
      currentHostname: ws.hostname,
      next: formatSequentialValue(prefix.trim(), start + i, pad),
    }));
  }, [ordered, prefix, start, pad]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const built = buildBatchRenameItems(workstations, {
      prefix,
      startIndex: Number.parseInt(startIndex, 10),
      paddingDigits: Number.parseInt(paddingDigits, 10),
      target,
    });
    if ('error' in built) {
      setFormError(built.error);
      return;
    }
    onApply(built.items);
  }

  const alertText = formError ?? errorMessage ?? null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 z-0 bg-black/50 backdrop-blur-sm"
        aria-label="Đóng đặt mã hàng loạt"
        disabled={isSubmitting}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground opacity-100 shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-2.5">
          <div className="min-w-0">
            <h3 id={titleId} className="text-sm font-semibold">
              Batch Rename / Quick Auto-fill
            </h3>
            <p className="text-xs text-muted-foreground">
              Gán Mã TS / hostname tuần tự theo thứ tự máy hiện tại trong phòng.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSubmitting}
            onClick={onClose}
          >
            Đóng
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-3 overflow-y-auto p-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="batch-prefix">Prefix</Label>
              <Input
                id="batch-prefix"
                value={prefix}
                placeholder="FIT.H1."
                disabled={isSubmitting}
                onChange={(e) => setPrefix(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="batch-target">Trường cập nhật</Label>
              <Select
                id="batch-target"
                value={target}
                disabled={isSubmitting}
                onChange={(e) => setTarget(e.target.value as BatchRenameTarget)}
              >
                <option value="both">Asset Tag / Mã TS và Hostname</option>
                <option value="assetCode">Asset Tag / Mã TS</option>
                <option value="hostname">Hostname</option>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="batch-start">start_index</Label>
                <Input
                  id="batch-start"
                  type="number"
                  min={0}
                  step={1}
                  value={startIndex}
                  disabled={isSubmitting}
                  onChange={(e) => setStartIndex(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="batch-pad">padding_digits</Label>
                <Input
                  id="batch-pad"
                  type="number"
                  min={1}
                  max={8}
                  step={1}
                  value={paddingDigits}
                  disabled={isSubmitting}
                  onChange={(e) => setPaddingDigits(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-md border">
              <p className="border-b px-3 py-2 text-xs text-muted-foreground">
                Xem trước {preview.length} máy — ví dụ:{' '}
                {prefix || '…'}
                {formatPaddedPreview(start, pad)}
              </p>
              <ul className="max-h-40 overflow-auto text-xs">
                {preview.slice(0, 8).map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 border-b px-3 py-1.5 last:border-b-0"
                  >
                    <span className="truncate text-muted-foreground">
                      {row.currentAsset} / {row.currentHostname}
                    </span>
                    <span className="shrink-0 font-medium">{row.next}</span>
                  </li>
                ))}
                {preview.length > 8 ? (
                  <li className="px-3 py-1.5 text-muted-foreground">
                    … và {preview.length - 8} máy nữa
                  </li>
                ) : null}
              </ul>
            </div>

            {alertText ? (
              <p role="alert" className="text-sm text-destructive">
                {alertText}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t px-4 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting || ordered.length === 0}>
              {isSubmitting ? 'Đang lưu…' : 'Áp dụng'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function formatPaddedPreview(start: number, pad: number): string {
  if (!Number.isInteger(start) || !Number.isInteger(pad) || pad < 1) {
    return '01';
  }
  return String(start).padStart(pad, '0');
}
