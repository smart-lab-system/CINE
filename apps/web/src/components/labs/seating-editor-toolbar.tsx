'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SeatingEditorController } from './use-seating-editor';
import { STAR_CLUSTER_MAX_SEATS, STAR_CLUSTER_MIN_SEATS } from './seating-editor-utils';

function ToolbarDivider() {
  return <div className="hidden h-7 w-px shrink-0 bg-border sm:block" aria-hidden />;
}

export function SeatingEditorToolbar({
  editor,
  saving,
  onSave,
}: {
  editor: SeatingEditorController;
  saving?: boolean;
  onSave: () => void;
}) {
  const { state, derived, actions } = editor;

  return (
    <section
      aria-label="Công cụ chỉnh sửa sơ đồ"
      className="rounded-lg border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Công cụ chỉnh sửa</h3>
          <p className="text-xs text-muted-foreground">
            Thêm, chọn nhiều và xóa ghế — tách khỏi bản đồ bên dưới.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => actions.setEditing(false)}
          >
            Xem sơ đồ
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? 'Đang lưu…' : 'Lưu sơ đồ'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tạo ghế
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Button type="button" size="sm" onClick={actions.addSeat}>
              Thêm ghế
            </Button>
            <ToolbarDivider />
            <div className="flex min-w-[4.5rem] flex-col gap-1">
              <Label htmlFor="toolbar-row-qty" className="text-xs">
                Số lượng
              </Label>
              <Input
                id="toolbar-row-qty"
                className="h-8 w-20"
                type="number"
                min={1}
                max={80}
                value={state.rowQty}
                onChange={(e) => actions.onRowQtyChange(e.target.value)}
              />
            </div>
            <div className="flex min-w-[5rem] flex-col gap-1">
              <Label htmlFor="toolbar-row-prefix" className="text-xs">
                Tiền tố
              </Label>
              <Input
                id="toolbar-row-prefix"
                className="h-8 w-24"
                maxLength={16}
                placeholder="H"
                value={state.rowPrefix}
                onChange={(e) => actions.setRowPrefix(e.target.value)}
              />
            </div>
            <div className="flex min-w-[5rem] flex-col gap-1">
              <Label htmlFor="toolbar-row-start" className="text-xs">
                Số bắt đầu
              </Label>
              <Input
                id="toolbar-row-start"
                className="h-8 w-24"
                type="number"
                min={0}
                value={state.rowStart}
                onChange={(e) => actions.onRowStartChange(e.target.value)}
              />
            </div>
            <div className="flex min-w-[5rem] flex-col gap-1">
              <Label htmlFor="toolbar-row-end" className="text-xs">
                Số kết thúc
              </Label>
              <Input
                id="toolbar-row-end"
                className="h-8 w-24"
                type="number"
                min={0}
                value={state.rowEnd}
                onChange={(e) => actions.onRowEndChange(e.target.value)}
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={actions.addRow}>
              Tạo hàng
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={actions.addStar}
              title={`Đa giác đều, ${STAR_CLUSTER_MIN_SEATS}–${STAR_CLUSTER_MAX_SEATS} ghế`}
            >
              Tạo cụm sao
            </Button>
          </div>
          {derived.rowPreview ? (
            <p className="text-xs text-muted-foreground">{derived.rowPreview}</p>
          ) : null}
          {state.rowError ? (
            <p role="alert" className="text-sm text-destructive">
              {state.rowError}
            </p>
          ) : null}
        </div>

        <div className="h-px bg-border" />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Chọn nhiều & thao tác
            </p>
            <p className="text-xs text-muted-foreground">
              {derived.hasSelection
                ? `Đã chọn ${state.selectedIds.length} ghế`
                : 'Chưa chọn ghế'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={actions.selectAll}
              disabled={state.seats.length === 0}
            >
              Chọn tất cả
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!derived.hasSelection}
              onClick={actions.clearSelection}
            >
              Bỏ chọn
            </Button>
            <ToolbarDivider />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!derived.hasSelection}
              onClick={() => actions.rotateSelected(-15)}
            >
              Xoay −15°
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!derived.hasSelection}
              onClick={() => actions.rotateSelected(15)}
            >
              Xoay +15°
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!derived.hasSelection}
              onClick={actions.removeSelected}
            >
              {derived.deleteLabel}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
