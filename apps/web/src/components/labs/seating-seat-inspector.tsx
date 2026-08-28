'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { EditorSeat } from './seating-editor-utils';
import type { WorkstationOption } from './seating-types';

export function SeatingSeatInspector({
  open,
  selected,
  workstations,
  readOnly,
  hideWorkstation,
  onClose,
  onUpdateSeat,
}: {
  open: boolean;
  selected: EditorSeat | null;
  workstations: WorkstationOption[];
  readOnly?: boolean;
  hideWorkstation?: boolean;
  onClose: () => void;
  onUpdateSeat: (clientId: string, patch: Partial<EditorSeat>) => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const wsMap = new Map(workstations.map((w) => [w.id, w]));
  const selectedWs = selected?.workstationId
    ? wsMap.get(selected.workstationId)
    : null;

  useEffect(() => {
    if (!open || !selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, selected]);

  useEffect(() => {
    if (!open || !selected) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, selected, onClose]);

  if (!open || !selected || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 isolate flex items-center justify-center p-4">
      <div
        className="absolute inset-0 z-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex w-full max-w-md flex-col rounded-lg border border-border bg-background text-foreground opacity-100 shadow-xl outline-none dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-2.5">
          <div className="min-w-0">
            <h3 id={titleId} className="text-sm font-semibold">
              Thuộc tính ghế
            </h3>
            <p className="text-xs text-muted-foreground">
              {readOnly
                ? 'Chế độ xem — bật chỉnh sửa để thay đổi ghế.'
                : hideWorkstation
                  ? 'Chỉnh mã ghế, hình dạng và ghi chú. Mẫu sơ đồ không gắn máy trạm.'
                  : 'Chỉnh mã ghế, máy trạm và trạng thái của ghế đang chọn.'}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seat-code">Mã ghế</Label>
            <Input
              id="seat-code"
              value={selected.seatCode}
              disabled={readOnly}
              onChange={(e) =>
                onUpdateSeat(selected.clientId, { seatCode: e.target.value })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seat-shape">Hình dạng</Label>
            <Select
              id="seat-shape"
              value={selected.shape ?? 'rect'}
              disabled={readOnly}
              onChange={(e) =>
                onUpdateSeat(selected.clientId, {
                  shape: e.target.value as EditorSeat['shape'],
                })
              }
            >
              <option value="rect">Chữ nhật</option>
              <option value="circle">Tròn</option>
              <option value="diamond">Thoi</option>
            </Select>
          </div>
          {hideWorkstation ? null : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="seat-ws">Máy trạm</Label>
                {selectedWs ? (
                  <Badge
                    variant={selectedWs.type === 'master' ? 'master' : 'client'}
                  >
                    {selectedWs.type === 'master'
                      ? 'Máy giảng viên'
                      : 'Máy sinh viên'}
                  </Badge>
                ) : null}
              </div>
              <Select
                id="seat-ws"
                value={selected.workstationId ?? ''}
                disabled={readOnly}
                onChange={(e) =>
                  onUpdateSeat(selected.clientId, {
                    workstationId: e.target.value || null,
                  })
                }
              >
                <option value="">— Không gắn máy —</option>
                {workstations.map((w) => (
                  <option key={w.id} value={w.id}>
                    [{w.type === 'master' ? 'Máy GV' : 'Máy SV'}] {w.assetCode}{' '}
                    ({w.hostname})
                  </option>
                ))}
              </Select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.isDisabled}
              disabled={readOnly}
              onChange={(e) =>
                onUpdateSeat(selected.clientId, {
                  isDisabled: e.target.checked,
                })
              }
            />
            Ghế không dùng
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seat-notes">Ghi chú</Label>
            <Input
              id="seat-notes"
              value={selected.notes ?? ''}
              disabled={readOnly}
              onChange={(e) =>
                onUpdateSeat(selected.clientId, {
                  notes: e.target.value || null,
                })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Vị trí: ({Math.round(selected.positionX)},{' '}
            {Math.round(selected.positionY)}) · Xoay:{' '}
            {selected.rotationDegrees}°
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
