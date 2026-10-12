import {
  SEED_ACADEMIC_YEARS,
  SEED_SEMESTERS,
  buildNominalClasses,
  classSizeBand,
  computerHostname,
  computerLocation,
  floorFromRoomCode,
  mapRoomStatus,
  mssvYearPrefix,
  mulberry32,
  nextMssv,
  pad2,
  validateTeacherEmail,
} from './rules';

describe('seed-master-data rules', () => {
  it('academic calendar seed matches current local year/semester shape', () => {
    expect(SEED_ACADEMIC_YEARS).toHaveLength(2);
    expect(SEED_ACADEMIC_YEARS.map((y) => y.code)).toEqual(['2025 - 2026', '2026 - 2027']);
    expect(SEED_ACADEMIC_YEARS.find((y) => y.code === '2026 - 2027')?.status).toBe('active');
    expect(SEED_ACADEMIC_YEARS.find((y) => y.code === '2025 - 2026')?.status).toBe('closed');

    expect(SEED_SEMESTERS).toHaveLength(6);
    const yearCodes = new Set(SEED_ACADEMIC_YEARS.map((y) => y.code));
    for (const s of SEED_SEMESTERS) {
      expect(yearCodes.has(s.yearCode)).toBe(true);
      expect(s.endDate > s.startDate).toBe(true);
    }
    const activeHk1 = SEED_SEMESTERS.find(
      (s) => s.yearCode === '2026 - 2027' && s.code === 'HK1',
    );
    expect(activeHk1?.status).toBe('active');
    expect(activeHk1?.name).toBe('Học kỳ 1 năm học 2026 - 2027');
  });

  it('pad2 zero-pads', () => {
    expect(pad2(1)).toBe('01');
    expect(pad2(40)).toBe('40');
  });

  it('floorFromRoomCode parses floor after building letter', () => {
    expect(floorFromRoomCode('H1.1')).toBe('1');
    expect(floorFromRoomCode('B2.3')).toBe('2');
    expect(floorFromRoomCode('A10.2')).toBe('10');
    expect(floorFromRoomCode('weird')).toBeNull();
  });

  it('mapRoomStatus maps Vietnamese labels', () => {
    expect(mapRoomStatus('Hoạt động')).toBe('active');
    expect(() => mapRoomStatus('???')).toThrow(/Unknown room status/);
  });

  it('hostname and location use room code + padded index', () => {
    expect(computerHostname('H1.1', 1)).toBe('H1.1.01');
    expect(computerHostname('H1.1', 40)).toBe('H1.1.40');
    expect(computerLocation(1)).toBe('M01');
    expect(computerLocation(40)).toBe('M40');
  });

  it('builds 96 nominal classes with correct codes and cohort', () => {
    const classes = buildNominalClasses();
    expect(classes).toHaveLength(96);
    expect(classes.map((c) => c.code)).toContain('DHCNTT17A');
    expect(classes.map((c) => c.code)).toContain('DHHTTT20CTT');
    const sample = classes.find((c) => c.code === 'DHKTPM18B');
    expect(sample).toMatchObject({
      cohortYear: 2022,
      name: 'Kỹ thuật phần mềm — Khóa 2022 — Lớp B',
      postfix: 'B',
    });
  });

  it('class size bands differ for regular vs TT postfixes', () => {
    expect(classSizeBand('A')).toEqual({ min: 80, max: 90 });
    expect(classSizeBand('ATT')).toEqual({ min: 40, max: 45 });
  });

  it('MSSV uses last two digits of cohort and stays unique', () => {
    expect(mssvYearPrefix(2021)).toBe('21');
    expect(mssvYearPrefix(2024)).toBe('24');
    const used = new Set<string>();
    const rand = mulberry32(20261007);
    const a = nextMssv(2021, rand, used);
    const b = nextMssv(2021, rand, used);
    expect(a).toMatch(/^21\d{6}$/);
    expect(b).toMatch(/^21\d{6}$/);
    expect(a).not.toBe(b);
    expect(used.size).toBe(2);
  });

  it('validates teacher emails at @hui.edu.vn', () => {
    expect(validateTeacherEmail('phamquangtri@hui.edu.vn')).toBe(true);
    expect(validateTeacherEmail('giangvien@phamquangtri')).toBe(false);
    expect(validateTeacherEmail('x@cine.local')).toBe(false);
  });
});
