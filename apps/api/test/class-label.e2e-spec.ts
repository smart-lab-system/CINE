import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ClassLabelService } from '../src/course/class-label.service';
import { createTestAccount } from './helpers/create-account';
import { freshTestYear, purgeTestSemesters, randomTag, semesterDates } from './helpers/master-data';
import { seedClass } from './helpers/seed';

describe('ClassLabelService (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let labels: ClassLabelService;
  let teacherId: string;
  const created: { classes: string[]; semesters: string[]; adm: string[] } = { classes: [], semesters: [], adm: [] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    labels = app.get(ClassLabelService, { strict: false });
    teacherId = await createTestAccount(ds, {
      email: `classlabel_${randomTag()}@example.com`,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
  });

  afterAll(async () => {
    try {
      await ds.query(`DELETE FROM examcollect.class WHERE id = ANY($1)`, [created.classes]).catch(() => undefined);
      await ds.query(`DELETE FROM examcollect.administrative_class WHERE id = ANY($1)`, [created.adm]).catch(() => undefined);
      await purgeTestSemesters(ds);
    } finally {
      await app.close();
    }
  });

  it('trả nhãn "mã – nhóm" và nhãn kèm học kỳ cho từng lớp, bỏ qua id không có thật', async () => {
    const year = await freshTestYear(ds);
    const { startDate, endDate } = semesterDates(year, 1);
    const [sem] = await ds.query(
      `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES ($1, 1, $2, $3) RETURNING id`,
      [year, startDate, endDate],
    );
    const code = `ZZ${randomTag()}`;
    const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [code]);
    created.adm.push(adm.id);

    const plain = await seedClass(ds, { teacherId, semesterId: sem.id, administrativeClassId: adm.id });
    const grouped = await seedClass(ds, { teacherId, semesterId: sem.id, administrativeClassId: adm.id, groupName: 'Nhóm 1' });
    created.classes.push(plain.id, grouped.id);
    const ghost = '00000000-0000-4000-8000-0000000000bb';

    const simple = await labels.labelsFor([plain.id, grouped.id, ghost]);
    expect(simple.get(plain.id)).toBe(code);
    expect(simple.get(grouped.id)).toBe(`${code} – Nhóm 1`);
    expect(simple.has(ghost)).toBe(false);

    const withSemester = await labels.labelsWithSemesterFor([plain.id, grouped.id]);
    expect(withSemester.get(plain.id)).toBe(`${code} · HK1 ${year}-${year + 1}`);
    expect(withSemester.get(grouped.id)).toBe(`${code} – Nhóm 1 · HK1 ${year}-${year + 1}`);
  });

  it('danh sách rỗng thì bản đồ rỗng và không truy vấn', async () => {
    expect((await labels.labelsFor([])).size).toBe(0);
    expect((await labels.labelsWithSemesterFor([])).size).toBe(0);
  });

  it('lớp cũ chưa có lớp danh nghĩa rơi về tên cũ, không ra NULL', async () => {
    const legacy = await seedClass(ds, { teacherId, groupName: 'Lớp cũ chưa gán' });
    created.classes.push(legacy.id);
    const map = await labels.labelsFor([legacy.id]);
    expect(map.get(legacy.id)).toBe(legacy.label);
  });
});
