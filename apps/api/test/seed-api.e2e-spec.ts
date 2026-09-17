import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { SeedModule } from '../src/seed/seed.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { SeedErrorCode } from '../src/seed/seed.types';

/**
 * Seed API enabled. SeedModule is imported explicitly — setup-e2e clears
 * SEED_API_ENABLED so AppModule alone never registers seed routes (keeps
 * seed-api-disabled.e2e-spec.ts honest). DATABASE_URL is forced to
 * examcollect_e2e (never the demo DB).
 */
describe('Seed API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  const stamp = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SeedModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);

    const adminEmail = `seed_admin_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: adminEmail,
      password: 'Demo123456!',
      role: 'admin',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'Demo123456!' });
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /seed/bootstrap-admin', () => {
    it('returns 409 BOOTSTRAP_NOT_AVAILABLE when accounts already exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/seed/bootstrap-admin')
        .send({
          name: 'Should Fail',
          email: `seed_bootstrap_fail_${stamp}@example.com`,
          password: 'Demo123456!',
        });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: SeedErrorCode.BOOTSTRAP_NOT_AVAILABLE,
      });
      expect(response.body).not.toHaveProperty('password');
    });
  });

  describe('POST /admin/seed/accounts', () => {
    const teacherEmail = `seed_teacher_${stamp}@example.com`;
    const initialPassword = 'Demo123456!';
    let teacherId: string;

    it('rejects non-admin JWT with 403', async () => {
      const teacherOnly = `seed_teacher_only_${stamp}@example.com`;
      await createTestAccount(dataSource, {
        email: teacherOnly,
        password: initialPassword,
        role: 'teacher',
      });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherOnly, password: initialPassword });

      const response = await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({
          name: 'Nope',
          email: `seed_blocked_${stamp}@example.com`,
          password: initialPassword,
          role: 'teacher',
        });

      expect(response.status).toBe(403);
    });

    it('creates a teacher then returns the same id on re-ensure', async () => {
      const first = await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Demo Teacher',
          email: teacherEmail,
          password: initialPassword,
          role: 'teacher',
        });

      expect(first.status).toBe(201);
      expect(first.body.created).toBe(true);
      expect(first.body.id).toBeDefined();
      expect(first.body).not.toHaveProperty('password');
      teacherId = first.body.id;

      const second = await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Demo Teacher',
          email: teacherEmail,
          password: 'DifferentPassword1!',
          role: 'teacher',
        });

      expect(second.status).toBe(200);
      expect(second.body.created).toBe(false);
      expect(second.body.id).toBe(teacherId);

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password: initialPassword });
      expect(login.status).toBe(200);
      expect(login.body.accessToken).toBeDefined();
    });

    it('updates password only when updatePassword is true', async () => {
      const newPassword = 'NewDemoPassword1!';

      const withoutFlag = await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Demo Teacher',
          email: teacherEmail,
          password: newPassword,
          role: 'teacher',
        });
      expect(withoutFlag.status).toBe(200);

      const stillOld = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password: initialPassword });
      expect(stillOld.status).toBe(200);

      const withFlag = await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Demo Teacher',
          email: teacherEmail,
          password: newPassword,
          role: 'teacher',
          updatePassword: true,
        });
      expect(withFlag.status).toBe(200);
      expect(withFlag.body.id).toBe(teacherId);

      const withNew = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password: newPassword });
      expect(withNew.status).toBe(200);

      const withOld = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password: initialPassword });
      expect(withOld.status).toBe(401);
    });
  });

  describe('POST /admin/seed/semesters and rooms', () => {
    it('ensures semester and room idempotently', async () => {
      const semesterName = `Seed HK ${stamp}`;
      const roomName = `Seed Room ${stamp}`;

      const sem1 = await request(app.getHttpServer())
        .post('/admin/seed/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: semesterName,
          startDate: '2026-09-01',
          endDate: '2027-01-15',
        });
      expect(sem1.status).toBe(201);
      expect(sem1.body.created).toBe(true);

      const sem2 = await request(app.getHttpServer())
        .post('/admin/seed/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: semesterName,
          startDate: '2026-09-01',
          endDate: '2027-01-15',
        });
      expect(sem2.status).toBe(200);
      expect(sem2.body.created).toBe(false);
      expect(sem2.body.id).toBe(sem1.body.id);

      const room1 = await request(app.getHttpServer())
        .post('/admin/seed/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: roomName, capacity: 40 });
      expect(room1.status).toBe(201);
      expect(room1.body.created).toBe(true);

      const room2 = await request(app.getHttpServer())
        .post('/admin/seed/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: roomName, capacity: 40 });
      expect(room2.status).toBe(200);
      expect(room2.body.created).toBe(false);
      expect(room2.body.id).toBe(room1.body.id);
    });
  });

  describe('POST /admin/seed/courses', () => {
    const semesterName = `Seed Course HK ${stamp}`;
    const headEmail = `seed_head_${stamp}@example.com`;
    const headPassword = 'Demo123456!';
    const courseCode = `SC${String(stamp).slice(-6)}`;

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Demo Head',
          email: headEmail,
          password: headPassword,
          role: 'department_admin',
        });

      await request(app.getHttpServer())
        .post('/admin/seed/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: semesterName,
          startDate: '2026-09-01',
          endDate: '2027-01-15',
        });
    });

    it('creates a new course then is idempotent on re-ensure', async () => {
      const first = await request(app.getHttpServer())
        .post('/admin/seed/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: courseCode,
          name: 'Seed Course',
          semesterName,
          departmentHeadEmail: headEmail,
        });

      expect(first.status).toBe(201);
      expect(first.body.created).toBe(true);
      expect(first.body.code.toLowerCase()).toBe(courseCode.toLowerCase());
      expect(first.body.departmentHeadId).toBeDefined();

      const second = await request(app.getHttpServer())
        .post('/admin/seed/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: courseCode,
          name: 'Seed Course',
          semesterName,
          departmentHeadEmail: headEmail,
        });

      expect(second.status).toBe(200);
      expect(second.body.created).toBe(false);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.claimed).toBeUndefined();
    });

    it('claims an unowned course inserted in-test', async () => {
      const unownedCode = `UO${String(stamp).slice(-6)}`;
      const semester = await dataSource.query(
        `SELECT id FROM examcollect.semester WHERE name = $1 LIMIT 1`,
        [semesterName],
      );
      expect(semester[0]?.id).toBeDefined();

      await dataSource.query(
        `INSERT INTO examcollect.course (code, name, semester_id, department_head_id)
         VALUES ($1, $2, $3::uuid, NULL)`,
        [unownedCode, 'Unowned Claim Course', semester[0].id],
      );

      const claimed = await request(app.getHttpServer())
        .post('/admin/seed/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: unownedCode,
          name: 'Unowned Claim Course',
          semesterName,
          departmentHeadEmail: headEmail,
        });

      expect(claimed.status).toBe(200);
      expect(claimed.body.created).toBe(false);
      expect(claimed.body.claimed).toBe(true);
      expect(claimed.body.departmentHeadId).toBeDefined();
      expect(claimed.body.code.toLowerCase()).toBe(unownedCode.toLowerCase());
    });
  });

  describe('POST /admin/seed/classes', () => {
    const semesterName = `Seed Class HK ${stamp}`;
    const headEmail = `seed_head_cls_${stamp}@example.com`;
    const teacherA = `seed_teacher_a_${stamp}@example.com`;
    const teacherB = `seed_teacher_b_${stamp}@example.com`;
    const password = 'Demo123456!';
    const className = `Nhóm Seed ${stamp}`;
    const courseCode = `CL${String(stamp).slice(-6)}`;

    beforeAll(async () => {
      for (const [email, role, name] of [
        [headEmail, 'department_admin', 'Head Cls'],
        [teacherA, 'teacher', 'Teacher A'],
        [teacherB, 'teacher', 'Teacher B'],
      ] as const) {
        await request(app.getHttpServer())
          .post('/admin/seed/accounts')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name, email, password, role });
      }

      await request(app.getHttpServer())
        .post('/admin/seed/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: semesterName,
          startDate: '2026-09-01',
          endDate: '2027-01-15',
        });

      await request(app.getHttpServer())
        .post('/admin/seed/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: courseCode,
          name: 'Cấu trúc dữ liệu',
          semesterName,
          departmentHeadEmail: headEmail,
        });
    });

    it('ensures class idempotently and rejects teacher mismatch', async () => {
      const first = await request(app.getHttpServer())
        .post('/admin/seed/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courseCode,
          semesterName,
          name: className,
          teacherEmail: teacherA,
        });
      expect(first.status).toBe(201);
      expect(first.body.created).toBe(true);

      const second = await request(app.getHttpServer())
        .post('/admin/seed/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courseCode,
          semesterName,
          name: className,
          teacherEmail: teacherA,
        });
      expect(second.status).toBe(200);
      expect(second.body.created).toBe(false);
      expect(second.body.id).toBe(first.body.id);

      const mismatch = await request(app.getHttpServer())
        .post('/admin/seed/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courseCode,
          semesterName,
          name: className,
          teacherEmail: teacherB,
        });
      expect(mismatch.status).toBe(409);
      expect(mismatch.body).toMatchObject({
        code: SeedErrorCode.CLASS_TEACHER_MISMATCH,
      });
    });
  });

  describe('POST /admin/seed/classes/roster', () => {
    const semesterName = `Seed Roster HK ${stamp}`;
    const headEmail = `seed_head_roster_${stamp}@example.com`;
    const teacherEmail = `seed_teacher_roster_${stamp}@example.com`;
    const password = 'Demo123456!';
    const className = `Nhóm Roster ${stamp}`;
    const courseCode = `SR${String(stamp).slice(-6)}`;
    let classId: string;
    let teacherToken: string;

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Head Roster',
          email: headEmail,
          password,
          role: 'department_admin',
        });
      await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Teacher Roster',
          email: teacherEmail,
          password,
          role: 'teacher',
        });

      await request(app.getHttpServer())
        .post('/admin/seed/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: semesterName,
          startDate: '2026-09-01',
          endDate: '2027-01-15',
        });

      await request(app.getHttpServer())
        .post('/admin/seed/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: courseCode,
          name: 'Seed Roster Course',
          semesterName,
          departmentHeadEmail: headEmail,
        });

      const klass = await request(app.getHttpServer())
        .post('/admin/seed/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courseCode,
          semesterName,
          name: className,
          teacherEmail,
        });
      classId = klass.body.id;

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password });
      teacherToken = login.body.accessToken;
    });

    it('imports roster and is idempotent on re-ensure', async () => {
      const students = [
        { mssv: '24000318', name: 'Nguyễn Hoàng Minh' },
        { mssv: '24000319', name: 'Trần Văn A' },
      ];

      const first = await request(app.getHttpServer())
        .post('/admin/seed/classes/roster')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courseCode,
          semesterName,
          className,
          students,
        });
      expect(first.status).toBe(201);
      expect(first.body.added).toBe(2);
      expect(first.body.classId).toBe(classId);

      const roster = await request(app.getHttpServer())
        .get(`/classes/${classId}/roster`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(roster.status).toBe(200);
      expect(roster.body).toHaveLength(2);

      const second = await request(app.getHttpServer())
        .post('/admin/seed/classes/roster')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courseCode,
          semesterName,
          className,
          students,
        });
      expect(second.status).toBe(200);
      expect(second.body.added).toBe(0);
      expect(second.body.unchanged).toBe(2);

      const roster2 = await request(app.getHttpServer())
        .get(`/classes/${classId}/roster`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(roster2.body).toHaveLength(2);
    });

    it('rejects invalid MSSV with 400 and writes nothing', async () => {
      const before = await request(app.getHttpServer())
        .get(`/classes/${classId}/roster`)
        .set('Authorization', `Bearer ${teacherToken}`);

      const response = await request(app.getHttpServer())
        .post('/admin/seed/classes/roster')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courseCode,
          semesterName,
          className,
          students: [{ mssv: 'bad mssv!', name: 'Invalid' }],
        });
      expect(response.status).toBe(400);

      const after = await request(app.getHttpServer())
        .get(`/classes/${classId}/roster`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(after.body).toHaveLength(before.body.length);
    });
  });

  describe('demo-ready ensure graph', () => {
    it('builds head + teacher + semester + room + course + class + roster', async () => {
      const demoStamp = `${stamp}_demo`;
      const password = 'Demo123456!';
      const headEmail = `demo_head_${demoStamp}@example.com`;
      const teacherEmail = `demo_teacher_${demoStamp}@example.com`;
      const semesterName = `Demo HK ${demoStamp}`;
      const roomName = `Demo Room ${demoStamp}`;
      const courseCode = `DM${String(stamp).slice(-4)}`;
      const className = 'Nhóm 01';

      await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Demo Head',
          email: headEmail,
          password,
          role: 'department_admin',
        });
      await request(app.getHttpServer())
        .post('/admin/seed/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Demo Teacher',
          email: teacherEmail,
          password,
          role: 'teacher',
        });

      await request(app.getHttpServer())
        .post('/admin/seed/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: semesterName,
          startDate: '2026-09-01',
          endDate: '2027-01-15',
        });
      await request(app.getHttpServer())
        .post('/admin/seed/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: roomName, capacity: 40 });

      const course = await request(app.getHttpServer())
        .post('/admin/seed/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: courseCode,
          name: 'Demo Course',
          semesterName,
          departmentHeadEmail: headEmail,
        });
      expect(course.status).toBe(201);

      const klass = await request(app.getHttpServer())
        .post('/admin/seed/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courseCode,
          semesterName,
          name: className,
          teacherEmail,
        });
      expect(klass.status).toBe(201);

      const roster = await request(app.getHttpServer())
        .post('/admin/seed/classes/roster')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courseCode,
          semesterName,
          className,
          students: [
            { mssv: '24001001', name: 'SV Demo 1' },
            { mssv: '24001002', name: 'SV Demo 2' },
          ],
        });
      expect(roster.status).toBe(201);
      expect(roster.body.added).toBe(2);

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password });
      expect(login.status).toBe(200);

      const teaching = await request(app.getHttpServer())
        .get('/classes/teaching')
        .set('Authorization', `Bearer ${login.body.accessToken}`);
      expect(teaching.status).toBe(200);
      expect(
        teaching.body.some((row: { id: string }) => row.id === klass.body.id),
      ).toBe(true);

      const list = await request(app.getHttpServer())
        .get(`/classes/${klass.body.id}/roster`)
        .set('Authorization', `Bearer ${login.body.accessToken}`);
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(2);
    });
  });
});
