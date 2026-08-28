import type { EditorSeat, SeatShape } from './seating-editor-utils';
import { DEFAULT_SEAT_SIZE, isSeatShape } from './seating-editor-utils';

export type TemplateSeatBlueprint = {
  x: number;
  y: number;
  label: string;
  shape: SeatShape;
  rotation: number;
  rowNo: number | null;
  columnNo: number | null;
};

export type SeatingTemplateListItem = {
  id: string;
  name: string;
  description: string | null;
  canvasWidth: number;
  canvasHeight: number;
  seatCount: number;
};

export type SeatingTemplateDetail = SeatingTemplateListItem & {
  layoutData: TemplateSeatBlueprint[];
};

const RELATIVE_SCALE = 1_000_000;
const SEAT_CODE_RE = /^[A-Za-z0-9._-]{1,32}$/;

export function toRelativeCoordinate(
  absolute: number,
  dimension: number,
): number {
  if (!Number.isFinite(absolute) || !Number.isFinite(dimension) || dimension <= 0) {
    return 0;
  }
  const rel = absolute / dimension;
  const clamped = Math.min(1, Math.max(0, rel));
  return Math.round(clamped * RELATIVE_SCALE) / RELATIVE_SCALE;
}

export function toAbsoluteCoordinate(
  relative: number,
  dimension: number,
): number {
  if (!Number.isFinite(relative) || !Number.isFinite(dimension) || dimension <= 0) {
    return 0;
  }
  const clampedRel = Math.min(1, Math.max(0, relative));
  return clampedRel * dimension;
}

export function clampSeatTopLeft(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  seatSize = DEFAULT_SEAT_SIZE,
): { x: number; y: number } {
  const maxX = Math.max(0, canvasWidth - seatSize);
  const maxY = Math.max(0, canvasHeight - seatSize);
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function editorSeatsToLayoutData(
  seats: EditorSeat[],
  canvasWidth: number,
  canvasHeight: number,
): TemplateSeatBlueprint[] {
  return seats.map((seat) => ({
    x: toRelativeCoordinate(seat.positionX, canvasWidth),
    y: toRelativeCoordinate(seat.positionY, canvasHeight),
    label: seat.seatCode,
    shape: isSeatShape(seat.shape) ? seat.shape : 'rect',
    rotation: seat.rotationDegrees,
    rowNo: seat.rowNo,
    columnNo: seat.columnNo,
  }));
}

export function layoutDataToEditorSeats(
  layoutData: TemplateSeatBlueprint[],
  canvasWidth: number,
  canvasHeight: number,
  idPrefix = 'tpl',
  seatSize = DEFAULT_SEAT_SIZE,
): EditorSeat[] {
  return layoutData.map((item, i) => {
    const pos = clampSeatTopLeft(
      toAbsoluteCoordinate(item.x, canvasWidth),
      toAbsoluteCoordinate(item.y, canvasHeight),
      canvasWidth,
      canvasHeight,
      seatSize,
    );
    return {
      clientId: `${idPrefix}-${i}-${item.label}`,
      seatCode: item.label,
      workstationId: null,
      rowNo: item.rowNo ?? null,
      columnNo: item.columnNo ?? null,
      positionX: round2(pos.x),
      positionY: round2(pos.y),
      rotationDegrees: item.rotation ?? 0,
      isDisabled: false,
      notes: null,
      shape: isSeatShape(item.shape) ? item.shape : 'rect',
    };
  });
}

export function rescaleEditorSeats(
  seats: EditorSeat[],
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
  seatSize = DEFAULT_SEAT_SIZE,
): EditorSeat[] {
  return layoutDataToEditorSeats(
    editorSeatsToLayoutData(seats, fromWidth, fromHeight),
    toWidth,
    toHeight,
    'rescale',
    seatSize,
  );
}

export function uniquifyEditorSeatCodes(
  seats: EditorSeat[],
  existingCodes: Iterable<string>,
): EditorSeat[] {
  const used = new Set(
    [...existingCodes].map((code) => code.toUpperCase()).filter(Boolean),
  );
  return seats.map((seat) => {
    const nextCode = nextUniqueSeatCode(seat.seatCode, used);
    used.add(nextCode.toUpperCase());
    return { ...seat, seatCode: nextCode, workstationId: null };
  });
}

export function nextUniqueSeatCode(
  desired: string,
  usedUpper: Set<string>,
): string {
  const base = desired.trim() || 'S01';
  if (SEAT_CODE_RE.test(base) && !usedUpper.has(base.toUpperCase())) {
    return base;
  }
  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `-${n}`;
    const prefix = base.slice(0, Math.max(1, 32 - suffix.length));
    const candidate = `${prefix}${suffix}`;
    if (SEAT_CODE_RE.test(candidate) && !usedUpper.has(candidate.toUpperCase())) {
      return candidate;
    }
  }
  return `S${String(usedUpper.size + 1).padStart(2, '0')}`.slice(0, 32);
}

export function normalizeLayoutData(raw: unknown): TemplateSeatBlueprint[] {
  if (!Array.isArray(raw)) {
    throw new Error('layout_data must be an array');
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`layout_data[${index}] must be an object`);
    }
    const row = item as Record<string, unknown>;
    const x = Number(row.x);
    const y = Number(row.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`layout_data[${index}] has invalid coordinates`);
    }
    const label = String(row.label ?? '').trim();
    if (!SEAT_CODE_RE.test(label)) {
      throw new Error(`layout_data[${index}] has an invalid label`);
    }
    const rotation = row.rotation == null ? 0 : Number(row.rotation);
    if (!Number.isFinite(rotation) || rotation < -360 || rotation > 360) {
      throw new Error(`layout_data[${index}] has an invalid rotation`);
    }
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      label,
      shape: isSeatShape(row.shape) ? row.shape : 'rect',
      rotation,
      rowNo: toOptionalPositiveInt(row.rowNo),
      columnNo: toOptionalPositiveInt(row.columnNo),
    };
  });
}

function toOptionalPositiveInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}
