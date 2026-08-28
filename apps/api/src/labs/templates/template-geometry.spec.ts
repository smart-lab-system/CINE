import {
  clampSeatTopLeft,
  instantiateLayoutData,
  isSeatShape,
  normalizeLayoutData,
  seatsToLayoutData,
  toAbsoluteCoordinate,
  toRelativeCoordinate,
  uniquifySeatCodes,
} from './template-geometry';

describe('template-geometry', () => {
  it('converts absolute pixels to relative 0..1 coordinates', () => {
    expect(toRelativeCoordinate(128, 1280)).toBe(0.1);
    expect(toRelativeCoordinate(72, 720)).toBe(0.1);
    expect(toRelativeCoordinate(0, 1280)).toBe(0);
    expect(toRelativeCoordinate(1280, 1280)).toBe(1);
    expect(toRelativeCoordinate(-10, 1280)).toBe(0);
    expect(toRelativeCoordinate(2000, 1280)).toBe(1);
    expect(toRelativeCoordinate(100, 0)).toBe(0);
  });

  it('converts relative coordinates back to absolute pixels', () => {
    expect(toAbsoluteCoordinate(0.1, 1280)).toBeCloseTo(128);
    expect(toAbsoluteCoordinate(0.1, 720)).toBeCloseTo(72);
    expect(toAbsoluteCoordinate(0, 640)).toBe(0);
    expect(toAbsoluteCoordinate(1, 640)).toBe(640);
    expect(toAbsoluteCoordinate(-0.2, 640)).toBe(0);
    expect(toAbsoluteCoordinate(1.4, 640)).toBe(640);
  });

  it('round-trips a seat on the same canvas', () => {
    const data = seatsToLayoutData(
      [
        {
          seatCode: 'A01',
          positionX: 100,
          positionY: 200,
          rotationDegrees: 15,
          rowNo: 1,
          columnNo: 1,
          shape: 'circle',
          workstationId: 'ws-should-be-dropped',
        },
      ],
      1280,
      720,
    );

    expect(data).toEqual([
      {
        x: toRelativeCoordinate(100, 1280),
        y: toRelativeCoordinate(200, 720),
        label: 'A01',
        shape: 'circle',
        rotation: 15,
        rowNo: 1,
        columnNo: 1,
      },
    ]);
    expect(data[0]).not.toHaveProperty('workstationId');

    const seats = instantiateLayoutData(data, 1280, 720);
    expect(seats).toHaveLength(1);
    expect(seats[0].positionX).toBeCloseTo(100);
    expect(seats[0].positionY).toBeCloseTo(200);
    expect(seats[0].seatCode).toBe('A01');
    expect(seats[0].shape).toBe('circle');
    expect(seats[0].workstationId).toBeNull();
    expect(seats[0].isDisabled).toBe(false);
    expect(seats[0].notes).toBeNull();
  });

  it('scales relative seats onto a differently sized room canvas', () => {
    const data = seatsToLayoutData(
      [{ seatCode: 'B02', positionX: 128, positionY: 72, shape: 'diamond' }],
      1280,
      720,
    );
    const seats = instantiateLayoutData(data, 640, 360);
    expect(seats[0].positionX).toBeCloseTo(64);
    expect(seats[0].positionY).toBeCloseTo(36);
    expect(seats[0].shape).toBe('diamond');
    expect(seats[0].workstationId).toBeNull();
  });

  it('clamps instantiated seats so the seat box stays on the canvas', () => {
    const seats = instantiateLayoutData(
      [{ x: 1, y: 1, label: 'Z01', shape: 'rect', rotation: 0, rowNo: null, columnNo: null }],
      100,
      80,
      48,
    );
    expect(seats[0].positionX).toBe(52);
    expect(seats[0].positionY).toBe(32);
    expect(clampSeatTopLeft(100, 80, 100, 80, 48)).toEqual({ x: 52, y: 32 });
  });

  it('uniquifies labels against existing room seat codes without copying hardware ids', () => {
    const incoming = instantiateLayoutData(
      [
        { x: 0.1, y: 0.1, label: 'A01', shape: 'rect', rotation: 0, rowNo: 1, columnNo: 1 },
        { x: 0.2, y: 0.1, label: 'B01', shape: 'rect', rotation: 0, rowNo: 1, columnNo: 2 },
      ],
      1280,
      720,
    );
    const unique = uniquifySeatCodes(incoming, ['A01', 'a01']);
    expect(unique.map((s) => s.seatCode)).toEqual(['A01-2', 'B01']);
    expect(unique.every((s) => s.workstationId === null)).toBe(true);
  });

  it('normalizes stored JSON and defaults missing shape to rect', () => {
    const data = normalizeLayoutData([
      { x: 0.25, y: 0.5, label: 'C03', rotation: 90 },
    ]);
    expect(data[0]).toEqual({
      x: 0.25,
      y: 0.5,
      label: 'C03',
      shape: 'rect',
      rotation: 90,
      rowNo: null,
      columnNo: null,
    });
    expect(isSeatShape('rect')).toBe(true);
    expect(isSeatShape('triangle')).toBe(false);
  });

  it('rejects malformed layout_data', () => {
    expect(() => normalizeLayoutData({})).toThrow(/array/);
    expect(() =>
      normalizeLayoutData([{ x: 0.1, y: 0.1, label: 'bad code' }]),
    ).toThrow(/invalid label/);
  });
});
