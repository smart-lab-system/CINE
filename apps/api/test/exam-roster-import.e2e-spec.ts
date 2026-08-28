import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { OBJECT_STORAGE } from '../src/storage/object-storage';
import { MemoryObjectStorage } from '../src/storage/memory-object-storage';

describe('Exam event roster import (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  const suffix = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OBJECT_STORAGE)
      .useClass(MemoryObjectStorage)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const adminUsername = `exam_roster_${suffix}`;
    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Exam Roster Admin',
    });
    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('imports allowed students when the file section matches an attached class', async () => {
    const sectionCode = `4220${suffix}`.slice(0, 12);
    const { eventId, sectionId } = await createDraftExam(sectionCode, 'a');

    const preview = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/roster-imports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', rosterXlsx(sectionCode), 'allowed.xlsx');
    expect(preview.status).toBe(201);
    expect(preview.body.sectionCodeMismatch).toBe(false);
    expect(preview.body.matchedCourseSectionId).toBe(sectionId);
    expect(preview.body.attachedSectionCodes).toContain(sectionCode);

    const apply = await request(app.getHttpServer())
      .post(
        `/exam-events/${eventId}/roster-imports/${preview.body.storedObjectId}/apply`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(apply.status).toBe(201);
    expect(apply.body).toMatchObject({
      courseSectionId: sectionId,
      allowed: 2,
      removed: 0,
    });

    const [{ count }] = await dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM lab_management.exam_event_allowed_students
       WHERE exam_event_id = $1 AND course_section_id = $2 AND deleted_at IS NULL`,
      [eventId, sectionId],
    );
    expect(count).toBe(2);
  });

  it('rejects apply when file section is not among attached classes', async () => {
    const sectionCode = `SEC${suffix}`.slice(0, 12);
    const { eventId } = await createDraftExam(sectionCode, 'b');

    const preview = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/roster-imports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', rosterXlsx('999999999999'), 'wrong.xlsx');
    expect(preview.status).toBe(201);
    expect(preview.body.sectionCodeMismatch).toBe(true);

    const denied = await request(app.getHttpServer())
      .post(
        `/exam-events/${eventId}/roster-imports/${preview.body.storedObjectId}/apply`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe('SECTION_CODE_MISMATCH');
  });

  it('requires at least one attached section before preview', async () => {
    const eventId = await createBareDraftExam();
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/roster-imports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', rosterXlsx('42200999'), 'no-section.xlsx');
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/attach at least one course section/i);
  });

  async function createDraftExam(
    sectionCode: string,
    tag: string,
  ): Promise<{ eventId: string; sectionId: string }> {
    const subject = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `ER${tag}${suffix}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 16),
        name: 'Exam roster subject',
        credits: 3,
      });
    const term = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `ET${tag}${suffix}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 16),
        name: 'Exam roster term',
        startsOn: '2026-09-01',
        endsOn: '2027-01-15',
      });
    const section = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: subject.body.id,
        academicTermId: term.body.id,
        sectionCode,
        name: 'Exam roster section',
      });
    const event = await request(app.getHttpServer())
      .post('/exam-events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `EXR${tag}${suffix}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 16),
        title: 'Exam roster event',
        subjectId: subject.body.id,
        sessionType: 'exam',
        scheduledStartAt: '2026-08-27T08:00:00.000Z',
        scheduledEndAt: '2026-08-27T11:00:00.000Z',
        durationMinutes: 90,
      });
    const attach = await request(app.getHttpServer())
      .post(`/exam-events/${event.body.id}/sections`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseSectionId: section.body.id });
    expect(attach.status).toBe(201);
    return { eventId: event.body.id, sectionId: section.body.id };
  }

  async function createBareDraftExam(): Promise<string> {
    const subject = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `BR${suffix}`.slice(0, 16),
        name: 'Bare exam subject',
        credits: 3,
      });
    const event = await request(app.getHttpServer())
      .post('/exam-events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `BRE${suffix}`.slice(0, 16),
        title: 'Bare exam',
        subjectId: subject.body.id,
        sessionType: 'exam',
        scheduledStartAt: '2026-08-27T08:00:00.000Z',
        scheduledEndAt: '2026-08-27T11:00:00.000Z',
        durationMinutes: 90,
      });
    return event.body.id;
  }
});

function rosterXlsx(sectionCode: string): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['', '', '', '', '', '', '', `Lớp học phần: ${sectionCode}`],
    ['STT', 'Mã số', 'Họ đệm', 'Tên'],
    [1, '22691861', 'Nguyễn Gia', 'Bảo'],
    [2, '23664311', 'Nguyễn Trọng', 'Hoài'],
    ['', 'Tổng cộng: 2'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
