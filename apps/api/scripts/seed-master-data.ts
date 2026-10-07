/**
 * Seed catalog master data from scripts/danh_sach_*.json + generation rules.
 *
 *   pnpm seed:master-data
 *   pnpm seed:master-data -- --seed 20261007 --reset-passwords --fresh-catalog
 *
 * Spec: docs/superpowers/specs/2026-10-07-seed-master-data-design.md
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import { generateFullName } from 'vietnamese-name-generator';
import dataSource from '../src/database/data-source';
import { AccountEntity } from '../src/identity/entities/account.entity';
import { CourseEntity } from '../src/master-data/entities/course.entity';
import { RoomEntity } from '../src/master-data/entities/room.entity';
import { ComputerEntity } from '../src/master-data/entities/computer.entity';
import { NominalClassEntity } from '../src/master-data/entities/nominal-class.entity';
import { StudentEntity } from '../src/master-data/entities/student.entity';
import {
  ADMIN_ACCOUNTS,
  COMPUTER_SPECS,
  TEACHER_PASSWORD,
  buildNominalClasses,
  classSizeBand,
  computerHostname,
  computerLocation,
  deriveSeed,
  floorFromRoomCode,
  mapRoomStatus,
  mulberry32,
  nextMssv,
  randomIntInclusive,
  validateTeacherEmail,
} from './seed-master-data/rules';

type TeacherJson = { text: string; href: string };
type CourseJson = { maHocPhan: string; tenMonHoc: string };
type RoomJson = {
  ma: string;
  ten: string;
  toa: string;
  sucChua: number;
  trangThai: string;
};

type Counts = { created: number; updated: number; skipped: number };

function emptyCounts(): Counts {
  return { created: 0, updated: 0, skipped: 0 };
}

function parseArgs(argv: string[]) {
  let seed = 20261007;
  let resetPasswords = false;
  let freshCatalog = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') {
      seed = Number(argv[++i]);
      if (!Number.isFinite(seed)) throw new Error('--seed must be a number');
    } else if (a === '--reset-passwords') {
      resetPasswords = true;
    } else if (a === '--fresh-catalog') {
      freshCatalog = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: pnpm seed:master-data -- [--seed N] [--reset-passwords] [--fresh-catalog]`);
      process.exit(0);
    }
  }
  return { seed, resetPasswords, freshCatalog };
}

function repoScriptsDir(): string {
  // apps/api/scripts/seed-master-data.ts → monorepo root scripts/
  return path.resolve(__dirname, '../../../scripts');
}

function readJson<T>(file: string): T {
  const full = path.join(repoScriptsDir(), file);
  return JSON.parse(fs.readFileSync(full, 'utf8')) as T;
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function upsertAccount(
  email: string,
  name: string,
  role: 'admin' | 'teacher',
  password: string,
  resetPasswords: boolean,
  counts: Counts,
): Promise<void> {
  const repo = dataSource.getRepository(AccountEntity);
  const existing = await repo.findOne({ where: { email } });
  if (!existing) {
    await repo.save(
      repo.create({
        name,
        email,
        role,
        passwordHash: await hashPassword(password),
        isActive: true,
      }),
    );
    counts.created++;
    return;
  }
  existing.name = name;
  existing.role = role;
  existing.isActive = true;
  if (resetPasswords) {
    existing.passwordHash = await hashPassword(password);
  }
  await repo.save(existing);
  counts.updated++;
}

async function seedAccounts(
  teachers: TeacherJson[],
  resetPasswords: boolean,
): Promise<Counts> {
  const counts = emptyCounts();
  for (const a of ADMIN_ACCOUNTS) {
    await upsertAccount(a.email, a.name, a.role, a.password, resetPasswords, counts);
  }
  for (const t of teachers) {
    const email = t.href.trim().toLowerCase();
    if (!validateTeacherEmail(email)) {
      throw new Error(`Invalid teacher email in JSON: ${JSON.stringify(t.href)}`);
    }
    await upsertAccount(email, t.text, 'teacher', TEACHER_PASSWORD, resetPasswords, counts);
  }
  return counts;
}

async function seedCourses(rows: CourseJson[]): Promise<Counts> {
  const repo = dataSource.getRepository(CourseEntity);
  const counts = emptyCounts();
  for (const r of rows) {
    const existing = await repo.findOne({ where: { code: r.maHocPhan } });
    if (!existing) {
      await repo.save(
        repo.create({ code: r.maHocPhan, name: r.tenMonHoc, status: 'active' }),
      );
      counts.created++;
    } else {
      existing.name = r.tenMonHoc;
      existing.status = 'active';
      await repo.save(existing);
      counts.updated++;
    }
  }
  return counts;
}

async function seedRooms(rows: RoomJson[]): Promise<{ counts: Counts; rooms: RoomEntity[] }> {
  const repo = dataSource.getRepository(RoomEntity);
  const counts = emptyCounts();
  const rooms: RoomEntity[] = [];
  for (const r of rows) {
    const status = mapRoomStatus(r.trangThai);
    const floor = floorFromRoomCode(r.ma);
    const existing = await repo.findOne({ where: { code: r.ma } });
    if (!existing) {
      const saved = await repo.save(
        repo.create({
          code: r.ma,
          name: r.ten,
          capacity: r.sucChua,
          building: r.toa,
          floor,
          status,
        }),
      );
      rooms.push(saved);
      counts.created++;
    } else {
      existing.name = r.ten;
      existing.capacity = r.sucChua;
      existing.building = r.toa;
      existing.floor = floor;
      existing.status = status;
      rooms.push(await repo.save(existing));
      counts.updated++;
    }
  }
  return { counts, rooms };
}

async function seedComputers(rooms: RoomEntity[]): Promise<Counts> {
  const repo = dataSource.getRepository(ComputerEntity);
  const counts = emptyCounts();
  for (const room of rooms) {
    const existingRows = await repo.find({ where: { roomId: room.id } });
    const byHost = new Map(existingRows.map((c) => [c.hostname, c]));
    const toInsert: ComputerEntity[] = [];
    const toUpdate: ComputerEntity[] = [];
    for (let i = 1; i <= room.capacity; i++) {
      const hostname = computerHostname(room.code, i);
      const location = computerLocation(i);
      const existing = byHost.get(hostname);
      if (!existing) {
        toInsert.push(
          repo.create({
            roomId: room.id,
            hostname,
            location,
            cpu: COMPUTER_SPECS.cpu,
            ramGb: COMPUTER_SPECS.ramGb,
            storage: COMPUTER_SPECS.storage,
            gpu: null,
            os: COMPUTER_SPECS.os,
            ipAddress: null,
            macAddress: null,
            status: COMPUTER_SPECS.status,
          }),
        );
      } else {
        existing.location = location;
        existing.cpu = COMPUTER_SPECS.cpu;
        existing.ramGb = COMPUTER_SPECS.ramGb;
        existing.storage = COMPUTER_SPECS.storage;
        existing.os = COMPUTER_SPECS.os;
        existing.status = COMPUTER_SPECS.status;
        toUpdate.push(existing);
      }
    }
    const CHUNK = 100;
    for (let o = 0; o < toInsert.length; o += CHUNK) {
      await repo.save(toInsert.slice(o, o + CHUNK));
    }
    for (let o = 0; o < toUpdate.length; o += CHUNK) {
      await repo.save(toUpdate.slice(o, o + CHUNK));
    }
    counts.created += toInsert.length;
    counts.updated += toUpdate.length;
  }
  return counts;
}

async function seedNominalClasses(): Promise<{
  counts: Counts;
  classes: Array<NominalClassEntity & { postfix: string }>;
}> {
  const repo = dataSource.getRepository(NominalClassEntity);
  const counts = emptyCounts();
  const classes: Array<NominalClassEntity & { postfix: string }> = [];
  for (const spec of buildNominalClasses()) {
    const existing = await repo.findOne({ where: { code: spec.code } });
    if (!existing) {
      const saved = await repo.save(
        repo.create({
          code: spec.code,
          name: spec.name,
          cohortYear: spec.cohortYear,
          status: 'active',
        }),
      );
      classes.push(Object.assign(saved, { postfix: spec.postfix }));
      counts.created++;
    } else {
      existing.name = spec.name;
      existing.cohortYear = spec.cohortYear;
      existing.status = 'active';
      const saved = await repo.save(existing);
      classes.push(Object.assign(saved, { postfix: spec.postfix }));
      counts.updated++;
    }
  }
  return { counts, classes };
}

async function seedStudents(
  classes: Array<NominalClassEntity & { postfix: string }>,
  seed: number,
): Promise<Counts> {
  const repo = dataSource.getRepository(StudentEntity);
  const counts = emptyCounts();
  const used = new Set<string>(
    (await repo.find({ select: ['mssv'] })).map((s) => s.mssv.toLowerCase()),
  );
  const rand = mulberry32(seed);

  for (const cls of classes) {
    const existingCount = await repo.count({ where: { nominalClassId: cls.id } });
    if (existingCount > 0) {
      counts.skipped += existingCount;
      continue;
    }
    const band = classSizeBand(cls.postfix);
    const size = randomIntInclusive(rand, band.min, band.max);
    const batch: StudentEntity[] = [];
    for (let i = 0; i < size; i++) {
      const mssv = nextMssv(cls.cohortYear!, rand, used);
      const nameSeed = deriveSeed(seed, mssv);
      const fullName = generateFullName({ seed: nameSeed });
      batch.push(
        repo.create({
          mssv,
          fullName,
          nominalClassId: cls.id,
          status: 'active',
        }),
      );
    }
    const CHUNK = 200;
    for (let o = 0; o < batch.length; o += CHUNK) {
      await repo.save(batch.slice(o, o + CHUNK));
    }
    counts.created += batch.length;
  }
  return counts;
}

async function wipeCatalog(): Promise<void> {
  // Order: children → parents. Does not touch exam_session / class / enrollment.
  await dataSource.query(`DELETE FROM examcollect.student`);
  await dataSource.query(`DELETE FROM examcollect.computer`);
  await dataSource.query(`DELETE FROM examcollect.nominal_class`);
  await dataSource.query(`DELETE FROM examcollect.course`);
  await dataSource.query(`DELETE FROM examcollect.room`);
  console.log('fresh-catalog: cleared student, computer, nominal_class, course, room');
}

function fmt(label: string, c: Counts): string {
  return `${label}: created=${c.created} updated=${c.updated} skipped=${c.skipped}`;
}

async function main(): Promise<void> {
  const { seed, resetPasswords, freshCatalog } = parseArgs(process.argv.slice(2));
  const teachers = readJson<TeacherJson[]>('danh_sach_giang_vien.json');
  const courses = readJson<CourseJson[]>('danh_sach_mon_hoc.json');
  const roomsJson = readJson<RoomJson[]>('danh_sach_phong_may.json');

  // Validate teachers before touching DB
  for (const t of teachers) {
    if (!validateTeacherEmail(t.href.trim().toLowerCase())) {
      throw new Error(`Invalid teacher email: ${t.href}`);
    }
  }
  console.log(
    `Loaded JSON: teachers=${teachers.length} courses=${courses.length} rooms=${roomsJson.length}`,
  );
  console.log(`Flags: seed=${seed} resetPasswords=${resetPasswords} freshCatalog=${freshCatalog}`);

  // Seed prints its own summary; TypeORM query spam hides it in dev.
  dataSource.setOptions({ logging: false });
  await dataSource.initialize();
  try {
    if (freshCatalog) await wipeCatalog();

    const accountCounts = await seedAccounts(teachers, resetPasswords);
    const courseCounts = await seedCourses(courses);
    const { counts: roomCounts, rooms } = await seedRooms(roomsJson);
    const computerCounts = await seedComputers(rooms);
    const { counts: classCounts, classes } = await seedNominalClasses();
    const studentCounts = await seedStudents(classes, seed);

    const computerTotal = await dataSource.getRepository(ComputerEntity).count();
    const studentTotal = await dataSource.getRepository(StudentEntity).count();

    console.log(fmt('accounts', accountCounts));
    console.log(fmt('courses', courseCounts));
    console.log(fmt('rooms', roomCounts));
    console.log(fmt('computers', computerCounts), `(total rows=${computerTotal})`);
    console.log(fmt('nominal_classes', classCounts));
    console.log(fmt('students', studentCounts), `(total rows=${studentTotal})`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
