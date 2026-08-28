import { describe, expect, it } from 'vitest';
import {
  clampPosition,
  clientIdsInRect,
  clampGroupDelta,
  createSeatRow,
  createSeatStar,
  deleteSeatsByIds,
  formatSeatNumber,
  moveSeatsByDelta,
  nextSeatCode,
  normalizeRect,
  regularPolygonVertices,
  resolveSeatNumberRange,
  rotatePointAround,
  rotateSeat,
  rotateSeatsAroundCentroid,
  seatCenterOriginTransform,
  selectionCentroid,
  seatTopLeftCenteredAt,
  seatsFromApi,
  seatsToApiPayload,
  starClusterQuantitySchema,
  toggleId,
  unionIds,
} from './seating-editor-utils';
import type { EditorSeat } from './seating-editor-utils';

describe('seating-editor-utils', () => {
  it('maps api seats to editor seats and back', () => {
    const api = [
      {
        id: 's1',
        seatCode: 'A01',
        workstationId: 'w1',
        rowNo: 1,
        columnNo: 2,
        positionX: 10,
        positionY: 20,
        rotationDegrees: 15,
        isDisabled: true,
        notes: 'broken chair',
      },
    ];
    const editor = seatsFromApi(api);
    expect(editor[0].clientId).toBe('s1');
    expect(editor[0].isDisabled).toBe(true);
    expect(seatsToApiPayload(editor)).toEqual([
      {
        id: 's1',
        seatCode: 'A01',
        workstationId: 'w1',
        rowNo: 1,
        columnNo: 2,
        positionX: 10,
        positionY: 20,
        rotationDegrees: 15,
        isDisabled: true,
        notes: 'broken chair',
        shape: 'rect',
      },
    ]);
  });

  it('generates the next free seat code', () => {
    expect(nextSeatCode([])).toBe('S01');
    expect(
      nextSeatCode([
        {
          clientId: '1',
          seatCode: 'S01',
          workstationId: null,
          rowNo: null,
          columnNo: null,
          positionX: 0,
          positionY: 0,
          rotationDegrees: 0,
          isDisabled: false,
          notes: null,
        },
      ]),
    ).toBe('S02');
  });

  it('rotates within ±360', () => {
    expect(rotateSeat(350, 15)).toBe(5);
    expect(rotateSeat(-350, -15)).toBe(-5);
  });

  it('computes the mean of selected coordinates as the centroid', () => {
    expect(
      selectionCentroid([
        { positionX: 0, positionY: 0 },
        { positionX: 10, positionY: 20 },
      ]),
    ).toEqual({ x: 5, y: 10 });
    expect(selectionCentroid([])).toBeNull();
  });

  it('rotates a point around a center with the standard 2D formula', () => {
    const aroundOrigin = rotatePointAround(10, 0, 0, 0, 90);
    expect(aroundOrigin.x).toBeCloseTo(0);
    expect(aroundOrigin.y).toBeCloseTo(10);

    const aroundCenter = rotatePointAround(20, 10, 10, 10, 90);
    expect(aroundCenter.x).toBeCloseTo(10);
    expect(aroundCenter.y).toBeCloseTo(20);
  });

  it('rotates selected seats ±15° around the group centroid without rotating icons', () => {
    const seats = [
      seatStub({
        clientId: 'a',
        positionX: 0,
        positionY: 10,
        rotationDegrees: 30,
      }),
      seatStub({ clientId: 'b', positionX: 20, positionY: 10 }),
      seatStub({ clientId: 'c', positionX: 100, positionY: 100 }),
    ];
    const cos = Math.cos(Math.PI / 12);
    const sin = Math.sin(Math.PI / 12);

    const rotated = rotateSeatsAroundCentroid(seats, ['a', 'b'], 15, 400, 400);
    expect(rotated[0].positionX).toBeCloseTo(10 - 10 * cos);
    expect(rotated[0].positionY).toBeCloseTo(10 - 10 * sin);
    expect(rotated[1].positionX).toBeCloseTo(10 + 10 * cos);
    expect(rotated[1].positionY).toBeCloseTo(10 + 10 * sin);
    expect(rotated[0].rotationDegrees).toBe(30);
    expect(rotated[1].rotationDegrees).toBe(0);
    expect(rotated[2]).toMatchObject({ positionX: 100, positionY: 100 });

    const back = rotateSeatsAroundCentroid(seats, ['a', 'b'], -15, 400, 400);
    expect(back[0].positionX).toBeCloseTo(10 - 10 * cos);
    expect(back[0].positionY).toBeCloseTo(10 + 10 * sin);
    expect(back[1].positionX).toBeCloseTo(10 + 10 * cos);
    expect(back[1].positionY).toBeCloseTo(10 - 10 * sin);
  });

  it('leaves a single selected seat in place (centroid is the point itself)', () => {
    const seats = [seatStub({ clientId: 'a', positionX: 40, positionY: 80 })];
    const rotated = rotateSeatsAroundCentroid(seats, ['a'], 15, 400, 400);
    expect(rotated[0].positionX).toBeCloseTo(40);
    expect(rotated[0].positionY).toBeCloseTo(80);
    expect(rotated[0].rotationDegrees).toBe(0);
  });

  it('clamps drag position inside the canvas', () => {
    expect(clampPosition(-10, 9999, 200, 100, 48)).toEqual({
      x: 0,
      y: 52,
    });
  });
});

function seatStub(overrides: Partial<EditorSeat> = {}): EditorSeat {
  return {
    clientId: '1',
    seatCode: 'S01',
    workstationId: null,
    rowNo: null,
    columnNo: null,
    positionX: 0,
    positionY: 0,
    rotationDegrees: 0,
    isDisabled: false,
    notes: null,
    ...overrides,
  };
}

describe('createSeatRow', () => {
  it('builds H04..H13 from quantity 10, prefix H, start 4', () => {
    expect(formatSeatNumber(4, 13)).toBe('04');
    expect(resolveSeatNumberRange({ start: 4, quantity: 10 })).toEqual({
      start: 4,
      end: 13,
    });

    const result = createSeatRow({
      prefix: 'H',
      start: 4,
      quantity: 10,
      existing: [],
      canvasWidth: 1280,
      canvasHeight: 720,
      idBase: 'row',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.seats).toHaveLength(10);
    expect(result.seats.map((s) => s.seatCode)).toEqual([
      'H04',
      'H05',
      'H06',
      'H07',
      'H08',
      'H09',
      'H10',
      'H11',
      'H12',
      'H13',
    ]);
    expect(result.seats.every((s) => s.workstationId === null)).toBe(true);
    expect(result.seats[0].rowNo).toBe(8);
    expect(result.seats.map((s) => s.columnNo)).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    expect(result.seats[0].positionY).toBe(result.seats[9].positionY);
    expect(result.seats[1].positionX).toBeGreaterThan(result.seats[0].positionX);
  });

  it('uses start/end numbers when provided', () => {
    const result = createSeatRow({
      prefix: 'B',
      start: 2,
      end: 5,
      existing: [],
      canvasWidth: 1280,
      canvasHeight: 720,
      idBase: 'b',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seats.map((s) => s.seatCode)).toEqual([
      'B02',
      'B03',
      'B04',
      'B05',
    ]);
  });

  it('rejects duplicate seat codes', () => {
    const result = createSeatRow({
      prefix: 'H',
      start: 4,
      quantity: 2,
      existing: [seatStub({ seatCode: 'H05' })],
      canvasWidth: 1280,
      canvasHeight: 720,
    });

    expect(result).toEqual({
      ok: false,
      error: 'duplicate-codes',
      codes: ['H05'],
    });
  });

  it('rejects an invalid prefix that would break seat codes', () => {
    const result = createSeatRow({
      prefix: 'H *',
      start: 1,
      quantity: 2,
      existing: [],
      canvasWidth: 1280,
      canvasHeight: 720,
    });
    expect(result).toEqual({ ok: false, error: 'invalid-code' });
  });
});

describe('createSeatStar', () => {
  it('places 10 seats on a regular decagon with codes H04..H13', () => {
    const result = createSeatStar({
      prefix: 'H',
      start: 4,
      quantity: 10,
      existing: [],
      canvasWidth: 1280,
      canvasHeight: 720,
      center: { x: 640, y: 360 },
      idBase: 'star',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.seats.map((s) => s.seatCode)).toEqual([
      'H04',
      'H05',
      'H06',
      'H07',
      'H08',
      'H09',
      'H10',
      'H11',
      'H12',
      'H13',
    ]);
    expect(result.seats.every((s) => s.workstationId === null)).toBe(true);

    const size = 48;
    const centers = result.seats.map((s) => ({
      x: s.positionX + size / 2,
      y: s.positionY + size / 2,
    }));
    const cx = 640;
    const cy = 360;
    const radii = centers.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const r0 = radii[0];
    radii.forEach((r) => expect(r).toBeCloseTo(r0, 5));

    expect(centers[0].x).toBeCloseTo(cx, 5);
    expect(centers[0].y).toBeLessThan(cy);

    for (let i = 0; i < centers.length; i += 1) {
      const theta = -Math.PI / 2 + (2 * Math.PI * i) / centers.length;
      const vertexX = cx + r0 * Math.cos(theta);
      const vertexY = cy + r0 * Math.sin(theta);
      expect(centers[i].x).toBeCloseTo(vertexX, 5);
      expect(centers[i].y).toBeCloseTo(vertexY, 5);

      const topLeft = seatTopLeftCenteredAt(vertexX, vertexY, size, size);
      expect(result.seats[i].positionX).toBeCloseTo(topLeft.x, 5);
      expect(result.seats[i].positionY).toBeCloseTo(topLeft.y, 5);

      const origin = seatCenterOriginTransform(
        result.seats[i].positionX,
        result.seats[i].positionY,
        size,
        size,
      );
      expect(origin.x).toBeCloseTo(vertexX, 5);
      expect(origin.y).toBeCloseTo(vertexY, 5);
      expect(origin.offsetX).toBe(size / 2);
      expect(origin.offsetY).toBe(size / 2);
    }
  });

  it('uses start/end indices when provided', () => {
    const result = createSeatStar({
      prefix: 'H',
      start: 4,
      end: 6,
      existing: [],
      canvasWidth: 1280,
      canvasHeight: 720,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seats.map((s) => s.seatCode)).toEqual(['H04', 'H05', 'H06']);
    expect(result.seats.every((s) => s.workstationId === null)).toBe(true);
  });

  it('aligns the two base seats of a 5-seat cluster on the same y', () => {
    const result = createSeatStar({
      prefix: 'H',
      start: 1,
      quantity: 5,
      existing: [],
      canvasWidth: 1280,
      canvasHeight: 720,
      center: { x: 640, y: 360 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const size = 48;
    const centers = result.seats.map((s) => ({
      x: s.positionX + size / 2,
      y: s.positionY + size / 2,
    }));
    const top = centers[0];
    expect(top.x).toBeCloseTo(640, 5);
    expect(top.y).toBeLessThan(360);
    expect(centers[2].y).toBeCloseTo(centers[3].y, 5);
    expect(centers[2].x).toBeGreaterThan(640);
    expect(centers[3].x).toBeLessThan(640);
    expect(centers[2].y).toBeGreaterThan(360);
    expect(Math.abs(centers[2].x - 640)).toBeCloseTo(Math.abs(centers[3].x - 640), 5);
  });

  it('rejects fewer than 3 or more than 10 seats', () => {
    expect(starClusterQuantitySchema.safeParse(2).success).toBe(false);
    expect(starClusterQuantitySchema.safeParse(11).success).toBe(false);
    expect(starClusterQuantitySchema.safeParse(3).success).toBe(true);
    expect(starClusterQuantitySchema.safeParse(10).success).toBe(true);

    expect(
      createSeatStar({
        prefix: 'H',
        start: 1,
        quantity: 2,
        existing: [],
        canvasWidth: 1280,
        canvasHeight: 720,
      }),
    ).toEqual({ ok: false, error: 'invalid-quantity' });

    expect(
      createSeatStar({
        prefix: 'H',
        start: 1,
        quantity: 11,
        existing: [],
        canvasWidth: 1280,
        canvasHeight: 720,
      }),
    ).toEqual({ ok: false, error: 'invalid-quantity' });
  });

  it('rejects duplicate seat codes', () => {
    expect(
      createSeatStar({
        prefix: 'H',
        start: 4,
        quantity: 3,
        existing: [seatStub({ seatCode: 'H04' })],
        canvasWidth: 1280,
        canvasHeight: 720,
      }),
    ).toEqual({
      ok: false,
      error: 'duplicate-codes',
      codes: ['H04'],
    });
  });

  it('places seats at point-top regular-polygon vertices θᵢ = −π/2 + 2π·i / N', () => {
    const vertices = regularPolygonVertices(4, 100, 100, 50);
    expect(vertices).toHaveLength(4);
    expect(vertices[0].x).toBeCloseTo(100);
    expect(vertices[0].y).toBeCloseTo(50);
    expect(vertices[1].x).toBeCloseTo(150);
    expect(vertices[1].y).toBeCloseTo(100);
    expect(vertices[2].x).toBeCloseTo(100);
    expect(vertices[2].y).toBeCloseTo(150);
    expect(vertices[3].x).toBeCloseTo(50);
    expect(vertices[3].y).toBeCloseTo(100);

    const pentagon = regularPolygonVertices(5, 100, 100, 50);
    expect(pentagon[0].x).toBeCloseTo(100);
    expect(pentagon[0].y).toBeCloseTo(50);
    expect(pentagon[2].y).toBeCloseTo(pentagon[3].y);
    expect(pentagon[2].x).toBeGreaterThan(100);
    expect(pentagon[3].x).toBeLessThan(100);
    expect(pentagon[2].y).toBeGreaterThan(100);
  });
});

describe('multi-select helpers', () => {
  it('toggles and unions ids', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
    expect(unionIds(['a'], ['a', 'c'])).toEqual(['a', 'c']);
  });

  it('selects seats intersecting a marquee rect', () => {
    const seats = [
      seatStub({ clientId: 'a', positionX: 0, positionY: 0 }),
      seatStub({ clientId: 'b', positionX: 100, positionY: 0 }),
      seatStub({ clientId: 'c', positionX: 0, positionY: 100 }),
    ];
    expect(clientIdsInRect(seats, { x: 0, y: 0, width: 50, height: 50 })).toEqual(
      ['a'],
    );
    expect(
      clientIdsInRect(seats, { x: 20, y: -10, width: 100, height: 40 }),
    ).toEqual(['a', 'b']);
    expect(normalizeRect(80, 80, 10, 20)).toEqual({
      x: 10,
      y: 20,
      width: 70,
      height: 60,
    });
  });

  it('clamps a group drag so every seat stays on the canvas', () => {
    expect(
      clampGroupDelta(
        [
          { positionX: 10, positionY: 20 },
          { positionX: 40, positionY: 20 },
        ],
        -50,
        5,
        200,
        100,
        48,
      ),
    ).toEqual({ dx: -10, dy: 5 });
  });

  it('moves and deletes the selected seats', () => {
    const seats = [
      seatStub({ clientId: 'a', positionX: 10, positionY: 10 }),
      seatStub({ clientId: 'b', positionX: 80, positionY: 10 }),
      seatStub({ clientId: 'c', positionX: 10, positionY: 80 }),
    ];
    const moved = moveSeatsByDelta(seats, ['a', 'c'], 15, 20, 400, 400, 48);
    expect(moved[0]).toMatchObject({ positionX: 25, positionY: 30 });
    expect(moved[1]).toMatchObject({ positionX: 80, positionY: 10 });
    expect(moved[2]).toMatchObject({ positionX: 25, positionY: 100 });
    expect(deleteSeatsByIds(seats, ['a', 'c']).map((s) => s.clientId)).toEqual([
      'b',
    ]);
  });
});
