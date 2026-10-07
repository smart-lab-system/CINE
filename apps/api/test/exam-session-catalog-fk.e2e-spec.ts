import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Dual-write catalog semester/room → exam_session (FK nullable + snapshot text).
 * Spec: 2026-10-07-sync-master-data-schema-design.md
 */
describe('exam_session catalog FK dual-write (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let teacherToken: string;
  let teacherId: string;
  let adminToken: string;

  const PASSWORD = 'correct-horse-battery';
  let windowCursor = 0;

  async function makeAccount(prefix: string, role: 'teacher' | 'admin') {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, { email, password: PASSWORD, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  async function seedClass() {
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      ['Catalog FK Course', `Lớp FK ${Date.now()}`, teacherId],
    );
    return klass.id as string;
  }

  async function seedCatalog() {
    const stamp = Date.now();
    const [year] = await dataSource.query(
      `INSERT INTO examcollect.academic_year (code, name, start_date, end_date, status)
       VALUES ($1, 'Năm FK', '2026-09-01', '2027-08-31', 'active') RETURNING id`,
      [`AY-FK-${stamp}`],
    );
    const [semActive] = await dataSource.query(
      `INSERT INTO examcollect.semester (academic_year_id, code, name, start_date, end_date, status)
       VALUES ($1, 'HK1', $2, '2026-09-01', '2027-01-31', 'active') RETURNING id, name`,
      [year.id, `HK1 Catalog ${stamp}`],
    );
    const [semClosed] = await dataSource.query(
      `INSERT INTO examcollect.semester (academic_year_id, code, name, start_date, end_date, status)
       VALUES ($1, 'HK2', $2, '2027-02-01', '2027-06-30', 'closed') RETURNING id`,
      [year.id, `HK2 Closed ${stamp}`],
    );
    const [roomActive] = await dataSource.query(
      `INSERT INTO examcollect.room (code, name, capacity, status)
       VALUES ($1, $2, 40, 'active') RETURNING id, name`,
      [`RF${stamp.toString().slice(-6)}`, `Phòng Catalog ${stamp}`],
    );
    const [roomMaint] = await dataSource.query(
      `INSERT INTO examcollect.room (code, name, capacity, status)
       VALUES ($1, $2, 40, 'maintenance') RETURNING id`,
      [`RM${stamp.toString().slice(-6)}`, `Phòng Maint ${stamp}`],
    );
    return {
      semesterId: semActive.id as string,
      semesterName: semActive.name as string,
      closedSemesterId: semClosed.id as string,
      roomId: roomActive.id as string,
      roomName: roomActive.name as string,
      maintenanceRoomId: roomMaint.id as string,
    };
  }

  function nextWindow() {
    windowCursor += 1;
    const start = Date.now() + windowCursor * 3 * 3_600_000;
    return {
      startTime: new Date(start).toISOString(),
      endTime: new Date(start + 3_600_000).toISOString(),
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const teacher = await makeAccount('fk_gv', 'teacher');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    const admin = await makeAccount('fk_admin', 'admin');
    adminToken = admin.token;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('tạo chỉ text → FK null; tạo có Id → dual-write; Id thắng text lệch', async () => {
    const classId = await seedClass();
    const catalog = await seedCatalog();

    const textOnly = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: 'Text only',
        classId,
        roomName: `Text Room ${Date.now()}`,
        semesterName: `Text HK ${Date.now()}`,
        examType: 'TK',
        ...nextWindow(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(textOnly.status).toBe(201);
    expect(textOnly.body.semesterId).toBeNull();
    expect(textOnly.body.roomId).toBeNull();

    const withIds = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: 'With catalog ids',
        classId,
        semesterId: catalog.semesterId,
        roomId: catalog.roomId,
        // Text lệch — server phải bỏ qua
        semesterName: 'CLIENT SAI KỲ',
        roomName: 'CLIENT SAI PHÒNG',
        examType: 'GK',
        ...nextWindow(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(withIds.status).toBe(201);
    expect(withIds.body.semesterId).toBe(catalog.semesterId);
    expect(withIds.body.roomId).toBe(catalog.roomId);
    expect(withIds.body.semesterName).toBe(catalog.semesterName);
    expect(withIds.body.roomName).toBe(catalog.roomName);

    const [row] = await dataSource.query(
      `SELECT semester_id, room_id, semester_name, room_name
       FROM examcollect.exam_session WHERE id = $1`,
      [withIds.body.id],
    );
    expect(row.semester_name).toBe(catalog.semesterName);
    expect(row.room_name).toBe(catalog.roomName);
  });

  it('semester closed / room maintenance → 400; missing uuid → 404', async () => {
    const classId = await seedClass();
    const catalog = await seedCatalog();

    const closed = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: 'Closed semester',
        classId,
        semesterId: catalog.closedSemesterId,
        roomId: catalog.roomId,
        examType: 'TK',
        ...nextWindow(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(closed.status).toBe(400);

    const maint = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: 'Maint room',
        classId,
        semesterId: catalog.semesterId,
        roomId: catalog.maintenanceRoomId,
        examType: 'TK',
        ...nextWindow(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(maint.status).toBe(400);

    const missing = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: 'Missing semester',
        classId,
        semesterId: '00000000-0000-4000-8000-000000000099',
        roomId: catalog.roomId,
        examType: 'TK',
        ...nextWindow(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(missing.status).toBe(404);
  });

  it('teacher GET catalog years/semesters/rooms 200; POST room 403', async () => {
    const getSem = await request(app.getHttpServer())
      .get('/master-data/semesters?status=active&page=1&pageSize=5')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(getSem.status).toBe(200);

    const getRooms = await request(app.getHttpServer())
      .get('/master-data/rooms?status=active&page=1&pageSize=5')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(getRooms.status).toBe(200);

    const getYears = await request(app.getHttpServer())
      .get('/master-data/academic-years?status=active&page=1&pageSize=5')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(getYears.status).toBe(200);

    const postRoom = await request(app.getHttpServer())
      .post('/master-data/rooms')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        code: `TX${Date.now().toString().slice(-6)}`,
        name: 'Teacher should not create',
        capacity: 10,
        status: 'active',
      });
    expect(postRoom.status).toBe(403);

    // Admin vẫn tạo được (control).
    const adminOk = await request(app.getHttpServer())
      .post('/master-data/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `AD${Date.now().toString().slice(-6)}`,
        name: 'Admin room ok',
        capacity: 10,
        status: 'active',
      });
    expect(adminOk.status).toBe(201);
  });

  it('xoá room catalog đang được phiên trỏ → SET NULL; room_name còn', async () => {
    const classId = await seedClass();
    const catalog = await seedCatalog();

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: 'Before room delete',
        classId,
        semesterId: catalog.semesterId,
        roomId: catalog.roomId,
        examType: 'CK',
        ...nextWindow(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);

    const del = await request(app.getHttpServer())
      .delete(`/master-data/rooms/${catalog.roomId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);

    const [row] = await dataSource.query(
      `SELECT room_id, room_name FROM examcollect.exam_session WHERE id = $1`,
      [created.body.id],
    );
    expect(row.room_id).toBeNull();
    expect(row.room_name).toBe(catalog.roomName);
  });
});
