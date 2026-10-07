/** Pure rules for master-data seed — no DB / I/O. Spec §4. */

export const TEACHER_EMAIL_RE = /^[a-z0-9._+-]+@hui\.edu\.vn$/i;

export const ADMIN_ACCOUNTS = [
  { name: 'Bảo', email: 'bao@hui.edu.vn', password: 'Admin@123', role: 'admin' as const },
  { name: 'Phát', email: 'phat@hui.edu.vn', password: 'Admin@123', role: 'admin' as const },
] as const;

export const TEACHER_PASSWORD = 'Teacher@123';

export const COMPUTER_SPECS = {
  cpu: 'i5 11400',
  ramGb: 16,
  storage: '512GB',
  os: 'Microsoft Windows 10 Home',
  status: 'active' as const,
};

export const NOMINAL_PREFIXES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'DHCNTT', label: 'Công nghệ thông tin' },
  { code: 'DHKTPM', label: 'Kỹ thuật phần mềm' },
  { code: 'DHKHMT', label: 'Khoa học máy tính' },
  { code: 'DHHTTT', label: 'Hệ thống thông tin' },
];

/** cohort_year → middle digits in class code */
export const COHORT_MIDDLE: ReadonlyArray<{ year: number; middle: string }> = [
  { year: 2021, middle: '17' },
  { year: 2022, middle: '18' },
  { year: 2023, middle: '19' },
  { year: 2024, middle: '20' },
];

export const NOMINAL_POSTFIXES = ['A', 'B', 'C', 'ATT', 'BTT', 'CTT'] as const;
export type NominalPostfix = (typeof NOMINAL_POSTFIXES)[number];

export type RoomStatus = 'active' | 'maintenance' | 'inactive';

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `H1.1` → `"1"`; `B2.3` → `"2"`; unparseable → null */
export function floorFromRoomCode(code: string): string | null {
  const m = code.match(/^[A-Za-z]+(\d+)\./);
  return m ? m[1] : null;
}

export function mapRoomStatus(trangThai: string): RoomStatus {
  const t = trangThai.trim().toLowerCase();
  if (t === 'hoạt động' || t === 'active') return 'active';
  if (t === 'bảo trì' || t === 'maintenance') return 'maintenance';
  if (t === 'ngừng' || t === 'inactive' || t === 'không hoạt động') return 'inactive';
  throw new Error(`Unknown room status: ${JSON.stringify(trangThai)}`);
}

export function computerHostname(roomCode: string, index1: number): string {
  return `${roomCode}.${pad2(index1)}`;
}

export function computerLocation(index1: number): string {
  return `M${pad2(index1)}`;
}

export function isRegularPostfix(postfix: string): boolean {
  return postfix === 'A' || postfix === 'B' || postfix === 'C';
}

/** Inclusive band for class size by postfix. */
export function classSizeBand(postfix: string): { min: number; max: number } {
  if (isRegularPostfix(postfix)) return { min: 80, max: 90 };
  if (postfix === 'ATT' || postfix === 'BTT' || postfix === 'CTT') {
    return { min: 40, max: 45 };
  }
  throw new Error(`Unknown nominal postfix: ${postfix}`);
}

export type NominalClassSpec = {
  code: string;
  name: string;
  cohortYear: number;
  postfix: NominalPostfix;
};

export function buildNominalClasses(): NominalClassSpec[] {
  const out: NominalClassSpec[] = [];
  for (const { code: prefix, label } of NOMINAL_PREFIXES) {
    for (const { year, middle } of COHORT_MIDDLE) {
      for (const postfix of NOMINAL_POSTFIXES) {
        out.push({
          code: `${prefix}${middle}${postfix}`,
          name: `${label} — Khóa ${year} — Lớp ${postfix}`,
          cohortYear: year,
          postfix,
        });
      }
    }
  }
  return out;
}

export function mssvYearPrefix(cohortYear: number): string {
  return String(cohortYear).slice(-2);
}

/** Mulberry32 — deterministic PRNG from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomIntInclusive(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/**
 * Generate a unique 8-digit MSSV: YY + 6 random digits.
 * `used` is mutated; retries until free.
 */
export function nextMssv(
  cohortYear: number,
  rand: () => number,
  used: Set<string>,
): string {
  const prefix = mssvYearPrefix(cohortYear);
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const suffix = Math.floor(rand() * 1_000_000)
      .toString()
      .padStart(6, '0');
    const mssv = `${prefix}${suffix}`;
    if (!used.has(mssv)) {
      used.add(mssv);
      return mssv;
    }
  }
  throw new Error(`Could not allocate unique MSSV for cohort ${cohortYear}`);
}

export function validateTeacherEmail(email: string): boolean {
  return TEACHER_EMAIL_RE.test(email);
}

/** Derive a stable int seed from base + string (for name generator). */
export function deriveSeed(base: number, key: string): number {
  let h = base >>> 0;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 0x9e3779b9) >>> 0;
  }
  return h;
}
