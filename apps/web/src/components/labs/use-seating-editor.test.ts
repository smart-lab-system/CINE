import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSeatingEditor } from './use-seating-editor';
import type { EditorSeat } from './seating-editor-utils';

function seat(overrides: Partial<EditorSeat> = {}): EditorSeat {
  return {
    clientId: 'c1',
    seatCode: 'A01',
    workstationId: null,
    rowNo: 1,
    columnNo: 1,
    positionX: 10,
    positionY: 20,
    rotationDegrees: 0,
    isDisabled: false,
    notes: null,
    ...overrides,
  };
}

const EMPTY_SEATS: EditorSeat[] = [];
const TWO_SEATS: EditorSeat[] = [
  seat(),
  seat({ clientId: 'c2', seatCode: 'A02' }),
];
const ONE_SEAT: EditorSeat[] = [seat()];

describe('useSeatingEditor', () => {
  it('adds a seat and selects it', () => {
    const { result } = renderHook(() =>
      useSeatingEditor({
        canvasWidth: 800,
        canvasHeight: 600,
        initialSeats: EMPTY_SEATS,
      }),
    );

    act(() => {
      result.current.actions.addSeat();
    });

    expect(result.current.state.seats).toHaveLength(1);
    expect(result.current.state.selectedIds).toEqual([
      result.current.state.seats[0].clientId,
    ]);
    expect(result.current.state.seats[0].seatCode).toBe('S01');
  });

  it('batch-deletes the current selection', () => {
    const { result } = renderHook(() =>
      useSeatingEditor({
        canvasWidth: 800,
        canvasHeight: 600,
        initialSeats: TWO_SEATS,
      }),
    );

    act(() => {
      result.current.actions.commitSelection(['c1', 'c2']);
    });
    act(() => {
      result.current.actions.removeSelected();
    });

    expect(result.current.state.seats).toEqual([]);
    expect(result.current.state.selectedIds).toEqual([]);
  });

  it('creates a row from toolbar inputs and reports duplicate codes', () => {
    const { result } = renderHook(() =>
      useSeatingEditor({
        canvasWidth: 800,
        canvasHeight: 600,
        initialSeats: ONE_SEAT,
      }),
    );

    act(() => {
      result.current.actions.onRowQtyChange('2');
    });
    act(() => {
      result.current.actions.setRowPrefix('A');
      result.current.actions.onRowStartChange('1');
    });
    act(() => {
      result.current.actions.addRow();
    });
    expect(result.current.state.rowError).toMatch(/đã tồn tại/i);

    act(() => {
      result.current.actions.setRowPrefix('B');
    });
    act(() => {
      result.current.actions.addRow();
    });
    expect(result.current.state.rowError).toBeNull();
    expect(result.current.state.seats.map((s) => s.seatCode)).toEqual([
      'A01',
      'B01',
      'B02',
    ]);
  });

  it('toggles edit mode without dropping seats', () => {
    const { result } = renderHook(() =>
      useSeatingEditor({
        canvasWidth: 800,
        canvasHeight: 600,
        initialSeats: ONE_SEAT,
      }),
    );

    expect(result.current.state.isEditing).toBe(true);
    act(() => {
      result.current.actions.setEditing(false);
    });
    expect(result.current.state.isEditing).toBe(false);
    expect(result.current.state.seats).toHaveLength(1);
  });
});
