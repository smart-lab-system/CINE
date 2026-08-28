import { z } from 'zod';

export const SEAT_SHAPES = ['rect', 'circle', 'diamond'] as const;
export type SeatShape = (typeof SEAT_SHAPES)[number];

export function isSeatShape(value: unknown): value is SeatShape {
  return (
    typeof value === 'string' &&
    (SEAT_SHAPES as readonly string[]).includes(value)
  );
}

export type EditorSeat = {
  clientId: string;
  id?: string;
  seatCode: string;
  workstationId: string | null;
  rowNo: number | null;
  columnNo: number | null;
  positionX: number;
  positionY: number;
  rotationDegrees: number;
  isDisabled: boolean;
  notes: string | null;
  shape?: SeatShape;
};

export type ApiSeat = {
  id: string;
  seatCode: string;
  workstationId: string | null;
  rowNo: number | null;
  columnNo: number | null;
  positionX: number;
  positionY: number;
  rotationDegrees: number;
  isDisabled?: boolean;
  notes?: string | null;
  shape?: SeatShape;
};

export function seatsFromApi(seats: ApiSeat[]): EditorSeat[] {
  return seats.map((s) => ({
    clientId: s.id,
    id: s.id,
    seatCode: s.seatCode,
    workstationId: s.workstationId,
    rowNo: s.rowNo,
    columnNo: s.columnNo,
    positionX: s.positionX,
    positionY: s.positionY,
    rotationDegrees: s.rotationDegrees,
    isDisabled: s.isDisabled ?? false,
    notes: s.notes ?? null,
    shape: isSeatShape(s.shape) ? s.shape : 'rect',
  }));
}

export function seatsToApiPayload(seats: EditorSeat[]) {
  return seats.map((s) => ({
    ...(s.id ? { id: s.id } : {}),
    seatCode: s.seatCode,
    workstationId: s.workstationId,
    rowNo: s.rowNo,
    columnNo: s.columnNo,
    positionX: s.positionX,
    positionY: s.positionY,
    rotationDegrees: s.rotationDegrees,
    isDisabled: s.isDisabled,
    notes: s.notes,
    shape: isSeatShape(s.shape) ? s.shape : 'rect',
  }));
}

export function nextSeatCode(existing: EditorSeat[]): string {
  const used = new Set(existing.map((s) => s.seatCode.toUpperCase()));
  let n = existing.length + 1;
  while (used.has(`S${String(n).padStart(2, '0')}`)) {
    n += 1;
  }
  return `S${String(n).padStart(2, '0')}`;
}

const SEAT_CODE_RE = /^[A-Za-z0-9._-]{1,32}$/;
const MAX_ROW_SEATS = 80;
/** Regular polygon: triangle … decagon. */
export const STAR_CLUSTER_MIN_SEATS = 3;
export const STAR_CLUSTER_MAX_SEATS = 10;
export const DEFAULT_SEAT_SIZE = 48;

export const starClusterQuantitySchema = z
  .number()
  .int()
  .min(STAR_CLUSTER_MIN_SEATS)
  .max(STAR_CLUSTER_MAX_SEATS);

export const starClusterCenterSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const starClusterInputSchema = z.object({
  prefix: z.string(),
  start: z.number().int().min(0),
  quantity: starClusterQuantitySchema.optional(),
  center: starClusterCenterSchema.optional(),
});

const ROW_GAP = 12;
const ROW_ORIGIN_X = 24;
const ROW_ORIGIN_Y = 24;

export type CreateRowErrorCode =
  | 'invalid-range'
  | 'invalid-quantity'
  | 'invalid-code'
  | 'duplicate-codes';

export type CreateRowResult =
  | { ok: true; seats: EditorSeat[] }
  | { ok: false; error: CreateRowErrorCode; codes?: string[] };

export function formatSeatNumber(n: number, maxNumber: number): string {
  const width = Math.max(2, String(Math.abs(maxNumber)).length);
  return String(n).padStart(width, '0');
}

export function resolveSeatNumberRange(input: {
  start: number;
  end?: number | null;
  quantity?: number | null;
}): { start: number; end: number } | { error: 'invalid-range' } {
  const start = Number(input.start);
  if (!Number.isInteger(start) || start < 0) {
    return { error: 'invalid-range' };
  }

  if (input.end != null) {
    const end = Number(input.end);
    if (!Number.isInteger(end) || end < start) {
      return { error: 'invalid-range' };
    }
    return { start, end };
  }

  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: 'invalid-range' };
  }
  return { start, end: start + quantity - 1 };
}

export function buildSeatCodes(
  prefix: string,
  start: number,
  end: number,
): string[] {
  const trimmed = prefix.trim();
  const codes: string[] = [];
  for (let n = start; n <= end; n += 1) {
    codes.push(`${trimmed}${formatSeatNumber(n, end)}`);
  }
  return codes;
}

export type SeatCenter = { x: number; y: number };

export type CreateSeatsInput = {
  prefix: string;
  start: number;
  end?: number | null;
  quantity?: number | null;
  existing: EditorSeat[];
  canvasWidth: number;
  canvasHeight: number;
  seatSize?: number;
  idBase?: string;
  /** Center of the regular polygon (seat visual centers). */
  center?: SeatCenter;
};

function nextRowNo(prefix: string, existing: EditorSeat[]): number {
  const letter = prefix.trim();
  if (/^[A-Za-z]$/.test(letter)) {
    return letter.toUpperCase().charCodeAt(0) - 64;
  }
  const maxRow = existing.reduce((max, seat) => {
    const row = seat.rowNo ?? 0;
    return row > max ? row : max;
  }, 0);
  return maxRow + 1;
}

function prepareSeatBatch(input: CreateSeatsInput):
  | { ok: false; error: CreateRowErrorCode; codes?: string[] }
  | {
      ok: true;
      codes: string[];
      range: { start: number; end: number };
      rowNo: number;
      seatSize: number;
      idBase: string;
    } {
  const range = resolveSeatNumberRange({
    start: input.start,
    end: input.end,
    quantity: input.quantity,
  });
  if ('error' in range) {
    return { ok: false, error: 'invalid-range' };
  }

  const count = range.end - range.start + 1;
  if (count < 1 || count > MAX_ROW_SEATS) {
    return { ok: false, error: 'invalid-quantity' };
  }

  const codes = buildSeatCodes(input.prefix, range.start, range.end);
  if (codes.some((code) => !SEAT_CODE_RE.test(code))) {
    return { ok: false, error: 'invalid-code' };
  }

  const used = new Set(input.existing.map((s) => s.seatCode.toUpperCase()));
  const duplicates = codes.filter((code) => used.has(code.toUpperCase()));
  if (duplicates.length > 0) {
    return { ok: false, error: 'duplicate-codes', codes: duplicates };
  }

  return {
    ok: true,
    codes,
    range,
    rowNo: nextRowNo(input.prefix, input.existing),
    seatSize: input.seatSize ?? DEFAULT_SEAT_SIZE,
    idBase: input.idBase ?? `new-${Date.now()}`,
  };
}

/** Top-left so the seat box center sits on (centerX, centerY). */
export function seatTopLeftCenteredAt(
  centerX: number,
  centerY: number,
  seatWidth = DEFAULT_SEAT_SIZE,
  seatHeight = DEFAULT_SEAT_SIZE,
): { x: number; y: number } {
  return {
    x: centerX - seatWidth / 2,
    y: centerY - seatHeight / 2,
  };
}

/** Konva equivalent of `transform: translate(-50%, -50%)` around the box center. */
export function seatCenterOriginTransform(
  positionX: number,
  positionY: number,
  seatWidth = DEFAULT_SEAT_SIZE,
  seatHeight = DEFAULT_SEAT_SIZE,
): { x: number; y: number; offsetX: number; offsetY: number } {
  return {
    x: positionX + seatWidth / 2,
    y: positionY + seatHeight / 2,
    offsetX: seatWidth / 2,
    offsetY: seatHeight / 2,
  };
}

function seatsFromPositions(
  codes: string[],
  range: { start: number; end: number },
  positions: { x: number; y: number }[],
  rowNo: number,
  idBase: string,
  canvasWidth: number,
  canvasHeight: number,
  seatSize: number,
  clampToCanvas = true,
): EditorSeat[] {
  return codes.map((seatCode, i) => {
    const next = clampToCanvas
      ? clampPosition(
          positions[i].x,
          positions[i].y,
          canvasWidth,
          canvasHeight,
          seatSize,
        )
      : positions[i];
    return {
      clientId: `${idBase}-${i}`,
      seatCode,
      workstationId: null,
      rowNo,
      columnNo: range.start + i,
      positionX: next.x,
      positionY: next.y,
      rotationDegrees: 0,
      isDisabled: false,
      notes: null,
      shape: 'rect',
    };
  });
}

export function createSeatRow(input: CreateSeatsInput): CreateRowResult {
  const prepared = prepareSeatBatch(input);
  if (!prepared.ok) {
    return prepared;
  }

  const { codes, range, rowNo, seatSize, idBase } = prepared;
  const originY =
    input.existing.length === 0
      ? ROW_ORIGIN_Y
      : Math.max(...input.existing.map((s) => s.positionY)) +
        seatSize +
        ROW_GAP;

  let x = ROW_ORIGIN_X;
  let y = originY;
  const positions = codes.map((_, i) => {
    if (i > 0 && x + seatSize > input.canvasWidth) {
      x = ROW_ORIGIN_X;
      y += seatSize + ROW_GAP;
    }
    const pos = { x, y };
    x += seatSize + ROW_GAP;
    return pos;
  });

  return {
    ok: true,
    seats: seatsFromPositions(
      codes,
      range,
      positions,
      rowNo,
      idBase,
      input.canvasWidth,
      input.canvasHeight,
      seatSize,
    ),
  };
}

export function resolveStarRadius(
  count: number,
  canvasWidth: number,
  canvasHeight: number,
  seatSize = DEFAULT_SEAT_SIZE,
): number {
  const padding = 24;
  const maxOuter =
    Math.min(canvasWidth, canvasHeight) / 2 - seatSize / 2 - padding;
  return Math.max(seatSize * 1.6, Math.min(maxOuter, 56 + count * 7));
}

export function resolveStarCenter(
  canvasWidth: number,
  canvasHeight: number,
  existing: EditorSeat[],
  radius: number,
  seatSize = DEFAULT_SEAT_SIZE,
  center?: SeatCenter,
): SeatCenter {
  if (center && starClusterCenterSchema.safeParse(center).success) {
    return center;
  }

  const padding = 24;
  const cx = canvasWidth / 2;
  let cy = canvasHeight / 2;
  if (existing.length > 0) {
    const below =
      Math.max(...existing.map((s) => s.positionY)) +
      seatSize +
      ROW_GAP +
      radius;
    const minCy = radius + seatSize / 2 + padding;
    const maxCy = canvasHeight - radius - seatSize / 2 - padding;
    cy = Math.min(maxCy, Math.max(minCy, below));
  }
  return { x: cx, y: cy };
}

/** Point-top regular N-gon: first vertex at 12 o'clock. */
const POLYGON_PHASE = -Math.PI / 2;

/** θᵢ = −π/2 + 2π·i / N */
export function regularPolygonAngle(index: number, count: number): number {
  return POLYGON_PHASE + (2 * Math.PI * index) / count;
}

/** Vertices of a regular N-gon, first vertex at the top. */
export function regularPolygonVertices(
  count: number,
  cx: number,
  cy: number,
  radius: number,
): SeatCenter[] {
  if (count <= 0) return [];
  const vertices: SeatCenter[] = [];
  for (let i = 0; i < count; i += 1) {
    const theta = regularPolygonAngle(i, count);
    vertices.push({
      x: cx + radius * Math.cos(theta),
      y: cy + radius * Math.sin(theta),
    });
  }
  return vertices;
}

export function starSeatPositions(
  count: number,
  canvasWidth: number,
  canvasHeight: number,
  existing: EditorSeat[],
  seatSize = DEFAULT_SEAT_SIZE,
  center?: SeatCenter,
): SeatCenter[] {
  const radius = resolveStarRadius(count, canvasWidth, canvasHeight, seatSize);
  const origin = resolveStarCenter(
    canvasWidth,
    canvasHeight,
    existing,
    radius,
    seatSize,
    center,
  );
  return regularPolygonVertices(count, origin.x, origin.y, radius).map((p) =>
    seatTopLeftCenteredAt(p.x, p.y, seatSize, seatSize),
  );
}

export function createSeatStar(input: CreateSeatsInput): CreateRowResult {
  const prepared = prepareSeatBatch(input);
  if (!prepared.ok) {
    return prepared;
  }

  const { codes, range, rowNo, seatSize, idBase } = prepared;
  const parsed = starClusterInputSchema.safeParse({
    prefix: input.prefix,
    start: range.start,
    quantity: codes.length,
    center: input.center,
  });
  if (!parsed.success) {
    return { ok: false, error: 'invalid-quantity' };
  }

  const positions = starSeatPositions(
    codes.length,
    input.canvasWidth,
    input.canvasHeight,
    input.existing,
    seatSize,
    parsed.data.center,
  );

  return {
    ok: true,
    seats: seatsFromPositions(
      codes,
      range,
      positions,
      rowNo,
      idBase,
      input.canvasWidth,
      input.canvasHeight,
      seatSize,
      false,
    ),
  };
}

export function rotateSeat(degrees: number, delta: number): number {
  let next = degrees + delta;
  while (next > 360) next -= 360;
  while (next < -360) next += 360;
  return Math.round(next * 100) / 100;
}

/** Mean of stored (x, y) coordinates: cx = (1/N) Σ xᵢ, cy = (1/N) Σ yᵢ. */
export function selectionCentroid(
  seats: { positionX: number; positionY: number }[],
): SeatCenter | null {
  const n = seats.length;
  if (n === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const seat of seats) {
    sx += seat.positionX;
    sy += seat.positionY;
  }
  return { x: sx / n, y: sy / n };
}

/**
 * Rotate (x, y) around (cx, cy) by Δθ degrees.
 * x' = cx + (x − cx) cos Δθ − (y − cy) sin Δθ
 * y' = cy + (x − cx) sin Δθ + (y − cy) cos Δθ
 */
export function rotatePointAround(
  x: number,
  y: number,
  cx: number,
  cy: number,
  deltaDegrees: number,
): SeatCenter {
  const theta = (deltaDegrees * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

/** Rotate selected seat positions around their group centroid. Icons stay upright. */
export function rotateSeatsAroundCentroid(
  seats: EditorSeat[],
  selectedIds: string[],
  deltaDegrees: number,
  canvasWidth: number,
  canvasHeight: number,
  seatSize = DEFAULT_SEAT_SIZE,
): EditorSeat[] {
  if (deltaDegrees === 0 || selectedIds.length === 0) return seats;
  const idSet = new Set(selectedIds);
  const members = seats.filter((s) => idSet.has(s.clientId));
  const centroid = selectionCentroid(members);
  if (!centroid) return seats;

  const rotatedMembers = members.map((s) => {
    const next = rotatePointAround(
      s.positionX,
      s.positionY,
      centroid.x,
      centroid.y,
      deltaDegrees,
    );
    return { positionX: next.x, positionY: next.y };
  });
  const clamped = clampGroupDelta(
    rotatedMembers,
    0,
    0,
    canvasWidth,
    canvasHeight,
    seatSize,
  );

  const byId = new Map(
    members.map((s, i) => [
      s.clientId,
      {
        x: rotatedMembers[i].positionX + clamped.dx,
        y: rotatedMembers[i].positionY + clamped.dy,
      },
    ]),
  );

  return seats.map((s) => {
    const next = byId.get(s.clientId);
    if (!next) return s;
    return { ...s, positionX: next.x, positionY: next.y };
  });
}

export function clampPosition(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  seatSize = 48,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, canvasWidth - seatSize)),
    y: Math.max(0, Math.min(y, canvasHeight - seatSize)),
  };
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export function unionIds(ids: string[], extra: string[]): string[] {
  const set = new Set(ids);
  extra.forEach((id) => set.add(id));
  return [...set];
}

export function normalizeRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

export function clientIdsInRect(
  seats: EditorSeat[],
  rect: { x: number; y: number; width: number; height: number },
  seatSize = 48,
): string[] {
  const x2 = rect.x + rect.width;
  const y2 = rect.y + rect.height;
  return seats
    .filter(
      (s) =>
        s.positionX < x2 &&
        s.positionX + seatSize > rect.x &&
        s.positionY < y2 &&
        s.positionY + seatSize > rect.y,
    )
    .map((s) => s.clientId);
}

export function clampGroupDelta(
  members: { positionX: number; positionY: number }[],
  dx: number,
  dy: number,
  canvasWidth: number,
  canvasHeight: number,
  seatSize = 48,
): { dx: number; dy: number } {
  if (members.length === 0) return { dx: 0, dy: 0 };
  const dxMin = -Math.min(...members.map((s) => s.positionX));
  const dyMin = -Math.min(...members.map((s) => s.positionY));
  const dxMax = Math.min(
    ...members.map((s) => canvasWidth - seatSize - s.positionX),
  );
  const dyMax = Math.min(
    ...members.map((s) => canvasHeight - seatSize - s.positionY),
  );
  return {
    dx: Math.max(dxMin, Math.min(dx, dxMax)),
    dy: Math.max(dyMin, Math.min(dy, dyMax)),
  };
}

export function moveSeatsByDelta(
  seats: EditorSeat[],
  selectedIds: string[],
  dx: number,
  dy: number,
  canvasWidth: number,
  canvasHeight: number,
  seatSize = 48,
): EditorSeat[] {
  const idSet = new Set(selectedIds);
  const members = seats.filter((s) => idSet.has(s.clientId));
  const clamped = clampGroupDelta(
    members,
    dx,
    dy,
    canvasWidth,
    canvasHeight,
    seatSize,
  );
  if (clamped.dx === 0 && clamped.dy === 0) return seats;
  return seats.map((s) =>
    idSet.has(s.clientId)
      ? {
          ...s,
          positionX: s.positionX + clamped.dx,
          positionY: s.positionY + clamped.dy,
        }
      : s,
  );
}

export function deleteSeatsByIds(
  seats: EditorSeat[],
  selectedIds: string[],
): EditorSeat[] {
  const idSet = new Set(selectedIds);
  return seats.filter((s) => !idSet.has(s.clientId));
}
