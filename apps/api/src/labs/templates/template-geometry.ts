export const SEAT_SHAPES = ['rect', 'circle', 'diamond'] as const;
export type SeatShape = (typeof SEAT_SHAPES)[number];

export const DEFAULT_TEMPLATE_SEAT_SIZE = 48;
const RELATIVE_SCALE = 1_000_000;
const SEAT_CODE_RE = /^[A-Za-z0-9._-]{1,32}$/;

export type TemplateSeatBlueprint = {
  /** Relative X of the seat top-left, 0..1 of canvas width. */
  x: number;
  /** Relative Y of the seat top-left, 0..1 of canvas height. */
  y: number;
  label: string;
  shape: SeatShape;
  rotation: number;
  rowNo: number | null;
  columnNo: number | null;
};

export type LayoutSourceSeat = {
  seatCode: string;
  positionX: number;
  positionY: number;
  rotationDegrees?: number;
  rowNo?: number | null;
  columnNo?: number | null;
  shape?: SeatShape | null;
  workstationId?: string | null;
};

export type InstantiatedSeat = {
  seatCode: string;
  positionX: number;
  positionY: number;
  rotationDegrees: number;
  rowNo: number | null;
  columnNo: number | null;
  shape: SeatShape;
  workstationId: null;
  isDisabled: false;
  notes: null;
};

export function isSeatShape(value: unknown): value is SeatShape {
  return (
    typeof value === 'string' &&
    (SEAT_SHAPES as readonly string[]).includes(value)
  );
}

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
  seatSize = DEFAULT_TEMPLATE_SEAT_SIZE,
): { x: number; y: number } {
  const maxX = Math.max(0, canvasWidth - seatSize);
  const maxY = Math.max(0, canvasHeight - seatSize);
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

export function seatsToLayoutData(
  seats: LayoutSourceSeat[],
  canvasWidth: number,
  canvasHeight: number,
): TemplateSeatBlueprint[] {
  return seats.map((seat) => ({
    x: toRelativeCoordinate(seat.positionX, canvasWidth),
    y: toRelativeCoordinate(seat.positionY, canvasHeight),
    label: seat.seatCode,
    shape: isSeatShape(seat.shape) ? seat.shape : 'rect',
    rotation: Number.isFinite(seat.rotationDegrees)
      ? (seat.rotationDegrees as number)
      : 0,
    rowNo: seat.rowNo ?? null,
    columnNo: seat.columnNo ?? null,
  }));
}

export function instantiateLayoutData(
  layoutData: TemplateSeatBlueprint[],
  canvasWidth: number,
  canvasHeight: number,
  seatSize = DEFAULT_TEMPLATE_SEAT_SIZE,
): InstantiatedSeat[] {
  return layoutData.map((item) => {
    const raw = clampSeatTopLeft(
      toAbsoluteCoordinate(item.x, canvasWidth),
      toAbsoluteCoordinate(item.y, canvasHeight),
      canvasWidth,
      canvasHeight,
      seatSize,
    );
    return {
      seatCode: item.label,
      positionX: round2(raw.x),
      positionY: round2(raw.y),
      rotationDegrees: item.rotation ?? 0,
      rowNo: item.rowNo ?? null,
      columnNo: item.columnNo ?? null,
      shape: isSeatShape(item.shape) ? item.shape : 'rect',
      workstationId: null,
      isDisabled: false,
      notes: null,
    };
  });
}

export function uniquifySeatCodes(
  seats: InstantiatedSeat[],
  existingCodes: Iterable<string>,
): InstantiatedSeat[] {
  const used = new Set(
    [...existingCodes].map((code) => code.toUpperCase()).filter(Boolean),
  );
  return seats.map((seat) => {
    const nextCode = nextUniqueSeatCode(seat.seatCode, used);
    used.add(nextCode.toUpperCase());
    return { ...seat, seatCode: nextCode };
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
  throw new Error('Could not allocate a unique seat code');
}

export function normalizeLayoutData(raw: unknown): TemplateSeatBlueprint[] {
  if (!Array.isArray(raw)) {
    throw new Error('layout_data must be an array');
  }
  return raw.map((item, index) => normalizeBlueprint(item, index));
}

function normalizeBlueprint(item: unknown, index: number): TemplateSeatBlueprint {
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
}

function toOptionalPositiveInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
