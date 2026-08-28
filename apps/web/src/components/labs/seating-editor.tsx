'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { EditorSeat } from './seating-editor-utils';
import { SeatingCanvas } from './seating-canvas';
import { SeatingEditorToolbar } from './seating-editor-toolbar';
import { SeatingSeatInspector } from './seating-seat-inspector';
import type { WorkstationOption } from './seating-types';
import { useSeatingEditor } from './use-seating-editor';

export type { WorkstationOption } from './seating-types';

export function SeatingEditor({
  canvasWidth,
  canvasHeight,
  initialSeats,
  workstations,
  onSave,
  saving,
  hideWorkstation = false,
}: {
  canvasWidth: number;
  canvasHeight: number;
  initialSeats: EditorSeat[];
  workstations: WorkstationOption[];
  onSave: (seats: EditorSeat[]) => void;
  saving?: boolean;
  hideWorkstation?: boolean;
}) {
  const editor = useSeatingEditor({
    canvasWidth,
    canvasHeight,
    initialSeats,
  });
  const { state, actions } = editor;
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const inspectingSeat = inspectingId
    ? (state.seats.find((seat) => seat.clientId === inspectingId) ?? null)
    : null;

  return (
    <div className="flex flex-col gap-4">
      {state.isEditing ? (
        <SeatingEditorToolbar
          editor={editor}
          saving={saving}
          onSave={() => onSave(state.seats)}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-sm">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Chế độ xem</p>
            <p className="text-xs text-muted-foreground">
              Bản đồ chỉ dùng để xem. Công cụ thêm/xóa ghế được tách sang chế độ
              chỉnh sửa.
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => actions.setEditing(true)}>
            Chỉnh sửa sơ đồ
          </Button>
        </div>
      )}

      <SeatingCanvas
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        seats={state.seats}
        selectedIds={state.selectedIds}
        workstations={workstations}
        editable={state.isEditing}
        onSelectionChange={actions.commitSelection}
        onMoveSeats={actions.moveSeats}
        onSeatDblClick={setInspectingId}
      />
      <SeatingSeatInspector
        open={Boolean(inspectingSeat)}
        selected={inspectingSeat}
        workstations={workstations}
        readOnly={!state.isEditing}
        hideWorkstation={hideWorkstation}
        onClose={() => setInspectingId(null)}
        onUpdateSeat={actions.updateSeat}
      />
    </div>
  );
}
