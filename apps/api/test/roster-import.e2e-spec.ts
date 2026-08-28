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

describe('Course section roster import (e2e)', () => {
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
    const adminUsername = `roster_admin_${suffix}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Roster Admin',
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

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects roster preview without a token', async () => {
    const response = await request(app.getHttpServer())
      .post(`/course-sections/${randomUUID()}/roster-imports`)
      .attach('file', rosterXlsx('42200999'), 'roster.xlsx');
    expect(response.status).toBe(401);
  });

  it('previews, applies, syncs, and updates names from an Excel roster', async () => {
    const { sectionId } = await createSection('42200999', 10);

    const preview = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/roster-imports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', rosterXlsx('42200999'), 'danh-sach.xlsx');
    expect(preview.status).toBe(201);
    expect(preview.body.sectionCodeMismatch).toBe(false);
    expect(preview.body.students).toEqual([
      { studentCode: '22691861', fullName: 'Nguyễn Gia Bảo' },
      { studentCode: '23664311', fullName: 'Nguyễn Trọng Hoài' },
    ]);

    const beforeApply = await request(app.getHttpServer())
      .get(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(beforeApply.body.total).toBe(0);

    const apply = await request(app.getHttpServer())
      .post(
        `/course-sections/${sectionId}/roster-imports/${preview.body.storedObjectId}/apply`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(apply.status).toBe(201);
    expect(apply.body).toMatchObject({
      createdStudents: 2,
      updatedStudents: 0,
      enrolled: 2,
      unenrolled: 0,
    });

    const extra = await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentCode: `EX${suffix}`.slice(0, 16),
        fullName: 'Sinh viên thừa',
      });
    expect(extra.status).toBe(201);
    const enrollExtra = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: extra.body.id });
    expect(enrollExtra.status).toBe(201);

    const renamedPreview = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/roster-imports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach(
        'file',
        rosterXlsx('42200999', [
          [1, '22691861', 'Nguyễn Gia', 'Bảo An'],
          [2, '23664311', 'Nguyễn Trọng', 'Hoài'],
        ]),
        'danh-sach-2.xlsx',
      );
    expect(renamedPreview.status).toBe(201);

    const reapply = await request(app.getHttpServer())
      .post(
        `/course-sections/${sectionId}/roster-imports/${renamedPreview.body.storedObjectId}/apply`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(reapply.status).toBe(201);
    expect(reapply.body).toMatchObject({
      createdStudents: 0,
      updatedStudents: 1,
      enrolled: 0,
      unenrolled: 1,
    });

    const list = await request(app.getHttpServer())
      .get(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(2);
    const bao = list.body.items.find(
      (row: { studentCode: string }) => row.studentCode === '22691861',
    );
    expect(bao.fullName).toBe('Nguyễn Gia Bảo An');

    const files = await request(app.getHttpServer())
      .get(`/course-sections/${sectionId}/files`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(files.status).toBe(200);
    expect(files.body.total).toBe(2);

    const download = await request(app.getHttpServer())
      .get(
        `/course-sections/${sectionId}/files/${reapply.body.fileId}/content`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toMatch(/danh-sach-2/);
  });

  it('warns on section-code mismatch and applies only after confirm', async () => {
    const { sectionId } = await createSection(`N${suffix}`.slice(0, 16), 10);

    const preview = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/roster-imports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', rosterXlsx('42200999'), 'mismatch.xlsx');
    expect(preview.status).toBe(201);
    expect(preview.body.sectionCodeMismatch).toBe(true);

    const denied = await request(app.getHttpServer())
      .post(
        `/course-sections/${sectionId}/roster-imports/${preview.body.storedObjectId}/apply`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe('SECTION_CODE_MISMATCH');

    const confirmed = await request(app.getHttpServer())
      .post(
        `/course-sections/${sectionId}/roster-imports/${preview.body.storedObjectId}/apply`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirmSectionMismatch: true });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.enrolled).toBe(2);
  });

  it('rejects a roster larger than max enrollment', async () => {
    const { sectionId } = await createSection(`C${suffix}`.slice(0, 16), 1);
    const preview = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/roster-imports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', rosterXlsx(`C${suffix}`.slice(0, 16)), 'over.xlsx');
    expect(preview.status).toBe(201);

    const apply = await request(app.getHttpServer())
      .post(
        `/course-sections/${sectionId}/roster-imports/${preview.body.storedObjectId}/apply`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirmSectionMismatch: true });
    expect(apply.status).toBe(400);
    expect(apply.body.message).toMatch(/max capacity/i);
  });

  async function createSection(
    sectionCode: string,
    maxEnrollment: number,
  ): Promise<{ sectionId: string }> {
    const subject = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `R${suffix}${sectionCode}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 16),
        name: 'Roster subject',
        credits: 3,
      });
    expect(subject.status).toBe(201);

    const term = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `TR${suffix}${sectionCode}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 16),
        name: 'Roster term',
        startsOn: '2026-09-01',
        endsOn: '2027-01-15',
      });
    expect(term.status).toBe(201);

    const section = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: subject.body.id,
        academicTermId: term.body.id,
        sectionCode,
        name: 'Roster section',
        maxEnrollment,
      });
    expect(section.status).toBe(201);
    return { sectionId: section.body.id };
  }
});

function rosterXlsx(
  sectionCode: string,
  students: unknown[][] = [
    [1, '22691861', 'Nguyễn Gia', 'Bảo'],
    [2, '23664311', 'Nguyễn Trọng', 'Hoài'],
  ],
): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['', '', '', '', '', '', '', `Lớp học phần: ${sectionCode}`],
    ['STT', 'Mã số', 'Họ đệm', 'Tên'],
    ...students,
    ['', 'Tổng cộng: 2'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
