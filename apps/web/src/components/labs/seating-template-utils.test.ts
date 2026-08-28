import { describe, expect, it } from 'vitest';
import type { EditorSeat } from './seating-editor-utils';
import {
  editorSeatsToLayoutData,
  layoutDataToEditorSeats,
  rescaleEditorSeats,
  toAbsoluteCoordinate,
  toRelativeCoordinate,
  uniquifyEditorSeatCodes,
} from './seating-template-utils';

function seat(overrides: Partial<EditorSeat> = {}): EditorSeat {
  return {
    clientId: 'c1',
    seatCode: 'A01',
    workstationId: 'ws-1',
    rowNo: 1,
    columnNo: 1,
    positionX: 128,
    positionY: 72,
    rotationDegrees: 0,
    isDisabled: false,
    notes: 'room note',
    shape: 'circle',
    ...overrides,
  };
}

describe('seating-template-utils', () => {
  it('stores relative coordinates and drops workstation bindings', () => {
    const data = editorSeatsToLayoutData([seat()], 1280, 720);
    expect(data[0].x).toBe(0.1);
    expect(data[0].y).toBe(0.1);
    expect(data[0].label).toBe('A01');
    expect(data[0].shape).toBe('circle');
    expect(data[0]).not.toHaveProperty('workstationId');
    expect(data[0]).not.toHaveProperty('notes');
  });

  it('instantiates unassigned seats on a target room canvas', () => {
    const data = editorSeatsToLayoutData([seat()], 1280, 720);
    const cloned = layoutDataToEditorSeats(data, 640, 360, 'new');
    expect(cloned).toHaveLength(1);
    expect(cloned[0].positionX).toBeCloseTo(64);
    expect(cloned[0].positionY).toBeCloseTo(36);
    expect(cloned[0].workstationId).toBeNull();
    expect(cloned[0].isDisabled).toBe(false);
    expect(cloned[0].notes).toBeNull();
    expect(cloned[0].id).toBeUndefined();
    expect(cloned[0].shape).toBe('circle');
    expect(cloned[0].clientId).toMatch(/^new-/);
  });

  it('round-trips the same canvas within 2 decimal places', () => {
    const original = seat({ positionX: 40, positionY: 60, shape: 'diamond' });
    const data = editorSeatsToLayoutData([original], 1280, 720);
    const back = layoutDataToEditorSeats(data, 1280, 720);
    expect(back[0].positionX).toBeCloseTo(40, 1);
    expect(back[0].positionY).toBeCloseTo(60, 1);
    expect(toRelativeCoordinate(40, 1280) * 1280).toBeCloseTo(
      toAbsoluteCoordinate(toRelativeCoordinate(40, 1280), 1280),
    );
  });

  it('rescales a cluster proportionally when the room size changes', () => {
    const seats = [
      seat({ clientId: 'a', positionX: 0, positionY: 0 }),
      seat({ clientId: 'b', seatCode: 'A02', positionX: 640, positionY: 360 }),
    ];
    const scaled = rescaleEditorSeats(seats, 1280, 720, 640, 360);
    expect(scaled[0].positionX).toBe(0);
    expect(scaled[0].positionY).toBe(0);
    expect(scaled[1].positionX).toBeCloseTo(320);
    expect(scaled[1].positionY).toBeCloseTo(180);
    expect(scaled.every((s) => s.workstationId === null)).toBe(true);
  });

  it('clamps seats that would overflow a smaller canvas', () => {
    const data = editorSeatsToLayoutData(
      [seat({ positionX: 1232, positionY: 672 })],
      1280,
      720,
    );
    const cloned = layoutDataToEditorSeats(data, 80, 80);
    expect(cloned[0].positionX).toBe(32);
    expect(cloned[0].positionY).toBe(32);
  });

  it('remaps colliding labels when appending onto an existing room', () => {
    const incoming = layoutDataToEditorSeats(
      [
        { x: 0.1, y: 0.1, label: 'A01', shape: 'rect', rotation: 0, rowNo: 1, columnNo: 1 },
        { x: 0.2, y: 0.1, label: 'B01', shape: 'rect', rotation: 0, rowNo: 1, columnNo: 2 },
      ],
      1280,
      720,
    );
    const unique = uniquifyEditorSeatCodes(incoming, ['A01']);
    expect(unique.map((s) => s.seatCode)).toEqual(['A01-2', 'B01']);
    expect(unique.every((s) => s.workstationId === null)).toBe(true);
  });
});
