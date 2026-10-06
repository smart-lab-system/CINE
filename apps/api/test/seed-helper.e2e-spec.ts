import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { COURSE_NAME } from '../src/common/course-name';
import { createTestAccount } from './helpers/create-account';
import {
  classLabel,
  seedClass,
  seedEnrollment,
  seedExamSession,
  sessionBody,
} from './helpers/seed';
import { freshTestYear, randomTag, semesterDates } from './helpers/master-data';

describe('seed helper (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let teacherId: string;
  let teacherToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `seed_helper_${Date.now()}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    teacherToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('classLabel hiện nhóm sau dấu gạch ngang, và chỉ mã khi không tách nhóm', () => {
    expect(classLabel('DHKTPM18A', '')).toBe('DHKTPM18A');
    expect(classLabel('DHKTPM18A', 'Nhóm 1')).toBe('DHKTPM18A – Nhóm 1');
  });

  it('seedClass dựng một lớp thật và trả nhãn', async () => {
    const klass = await seedClass(dataSource, { teacherId, groupName: 'Nhóm 2' });

    expect(klass.label).toBe(`${klass.code} – Nhóm 2`);
    const [row] = await dataSource.query(
      `SELECT course_name, name, teacher_id FROM examcollect.class WHERE id = $1`,
      [klass.id],
    );
    expect(row.course_name).toBe(COURSE_NAME);
    expect(row.name).toBe(klass.label);
    expect(row.teacher_id).toBe(teacherId);
  });

  it('seedClass giữ courseName khi test cố ý dùng môn khác', async () => {
    const klass = await seedClass(dataSource, { teacherId, courseName: 'Môn khác hẳn' });
    const [row] = await dataSource.query(
      `SELECT course_name FROM examcollect.class WHERE id = $1`,
      [klass.id],
    );
    expect(row.course_name).toBe('Môn khác hẳn');
  });

  it('mã lớp tự sinh duy nhất, chỉ gồm chữ HOA và số, dài 3–30 ký tự', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 25; i++) {
      codes.add((await seedClass(dataSource, { teacherId })).code);
    }
    expect(codes.size).toBe(25);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z0-9]{3,30}$/);
    }
  });

  it('seedEnrollment ghi tên vào `student` (một chỗ) và enrollment KHÔNG kèm tên; đặt tên mặc định khi không cho', async () => {
    const klass = await seedClass(dataSource, { teacherId });
    const mssv = `SH${Date.now().toString(36)}`.toUpperCase().slice(0, 12);
    await seedEnrollment(dataSource, { classId: klass.id, teacherId, mssv });

    const [row] = await dataSource.query(
      `SELECT student_mssv, student_name, home_class_id, home_teacher_id
         FROM examcollect.enrollment WHERE home_class_id = $1`,
      [klass.id],
    );
    expect(row).toMatchObject({
      student_mssv: mssv,
      student_name: null,
      home_class_id: klass.id,
      home_teacher_id: teacherId,
    });
    const [student] = await dataSource.query(`SELECT full_name FROM examcollect.student WHERE mssv = $1`, [mssv]);
    expect(student.full_name).toBe(`Sinh viên ${mssv}`);
  });

  it('seedEnrollment với legacyName dựng hình dạng TRƯỚC backfill: có tên cũ ở enrollment, không có hàng student', async () => {
    const klass = await seedClass(dataSource, { teacherId });
    const mssv = `SL${Date.now().toString(36)}`.toUpperCase().slice(0, 12);
    await seedEnrollment(dataSource, { classId: klass.id, teacherId, mssv, legacyName: 'Tên cũ chưa backfill' });

    const [row] = await dataSource.query(
      `SELECT student_name FROM examcollect.enrollment WHERE home_class_id = $1`,
      [klass.id],
    );
    expect(row.student_name).toBe('Tên cũ chưa backfill');
    const students = await dataSource.query(`SELECT 1 FROM examcollect.student WHERE mssv = $1`, [mssv]);
    expect(students).toHaveLength(0);
  });

  it('seedExamSession chèn thẳng một phiên mà service sẽ từ chối, và trả đủ định danh', async () => {
    const klass = await seedClass(dataSource, { teacherId });
    const start = new Date(Date.now() - 3 * 24 * 3_600_000);
    const session = await seedExamSession(dataSource, {
      teacherId,
      classId: klass.id,
      startTime: start,
      endTime: new Date(start.getTime() + 3_600_000),
      status: 'completed',
    });

    expect(session.code).toMatch(/^[A-Z0-9]{1,20}$/);
    const [row] = await dataSource.query(
      `SELECT status, room_name, semester_name, course_name FROM examcollect.exam_session WHERE id = $1`,
      [session.id],
    );
    expect(row).toMatchObject({
      status: 'completed',
      room_name: session.roomName,
      semester_name: 'HK kiểm thử',
      course_name: COURSE_NAME,
    });
  });

  it('sessionBody mặc định đủ để POST /exam-sessions trả 201', async () => {
    const klass = await seedClass(dataSource, { teacherId });
    const body = await sessionBody(dataSource, { classId: klass.id });

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body.classId).toBe(klass.id);
    // Dọn để không giữ chỗ giảng viên này cho các ca sau.
    await dataSource.query(
      `UPDATE examcollect.exam_session SET status = 'completed' WHERE teacher_id = $1`,
      [teacherId],
    );
  });

  it('sessionBody từ chối khi chỉ truyền một đầu của khung giờ', async () => {
    await expect(
      sessionBody(dataSource, { classId: 'x', startTime: new Date().toISOString() }),
    ).rejects.toThrow(/startTime và endTime/);
    await expect(
      sessionBody(dataSource, { classId: 'x', endTime: new Date().toISOString() }),
    ).rejects.toThrow(/startTime và endTime/);
  });

  it('sessionBody giữ nguyên phòng, học kỳ và tên file mà test truyền vào', async () => {
    const body = await sessionBody(dataSource, {
      classId: 'c1',
      roomName: 'P Cố Định',
      semesterName: 'HK Riêng',
      requiredFilenames: ['A.docx', { filename: 'B.zip', entries: ['x.txt'] }],
    });

    expect(body).toMatchObject({
      classId: 'c1',
      roomName: 'P Cố Định',
      semesterName: 'HK Riêng',
      examType: 'TK',
      requiredFilenames: ['A.docx', { filename: 'B.zip', entries: ['x.txt'] }],
    });
  });

  it('seedClass ghi học kỳ, lớp danh nghĩa và nhóm khi được cho', async () => {
    const year = await freshTestYear(dataSource);
    const { startDate, endDate } = semesterDates(year, 1);
    const [sem] = await dataSource.query(
      `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES ($1, 1, $2, $3) RETURNING id`,
      [year, startDate, endDate],
    );
    const [adm] = await dataSource.query(
      `INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`,
      [`ZZ${randomTag()}`],
    );
    const klass = await seedClass(dataSource, {
      teacherId,
      semesterId: sem.id,
      administrativeClassId: adm.id,
      groupName: 'Nhóm 3',
    });
    const [row] = await dataSource.query(
      `SELECT semester_id, administrative_class_id, group_name FROM examcollect.class WHERE id = $1`,
      [klass.id],
    );
    expect(row).toEqual({ semester_id: sem.id, administrative_class_id: adm.id, group_name: 'Nhóm 3' });
    await dataSource.query(`DELETE FROM examcollect.class WHERE id = $1`, [klass.id]);
    await dataSource.query(`DELETE FROM examcollect.semester WHERE id = $1`, [sem.id]);
    await dataSource.query(`DELETE FROM examcollect.administrative_class WHERE id = $1`, [adm.id]);
  });

  it('seedExamSession ghi room_id khi được cho', async () => {
    const klass = await seedClass(dataSource, { teacherId });
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name) VALUES ($1) RETURNING id`,
      [`Phong ZZ${randomTag()}`],
    );
    const start = new Date(Date.now() - 5 * 24 * 3_600_000);
    const session = await seedExamSession(dataSource, {
      teacherId,
      classId: klass.id,
      startTime: start,
      endTime: new Date(start.getTime() + 3_600_000),
      status: 'completed',
      roomId: room.id,
    });
    const [row] = await dataSource.query(`SELECT room_id FROM examcollect.exam_session WHERE id = $1`, [session.id]);
    expect(row.room_id).toBe(room.id);
  });
});
