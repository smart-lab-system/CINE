import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('Master Data (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  const suffix = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const adminUsername = `md_admin_${suffix}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Master Data Admin',
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

  let subjectId: string;
  let termId: string;
  let studentId: string;
  let lecturerId: string;
  let sectionId: string;

  it('rejects subject creation without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/subjects')
      .send({ code: `X${suffix}`.slice(0, 8), name: 'Unauthorized' });
    expect(response.status).toBe(401);
  });

  it('creates a subject', async () => {
    const response = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `SUB${suffix}`.slice(0, 16),
        name: 'Algorithms',
        credits: 3,
      });
    expect(response.status).toBe(201);
    subjectId = response.body.id;
  });

  it('rejects duplicate subject codes with 409', async () => {
    const code = `SUB${suffix}`.slice(0, 16);
    const response = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, name: 'Duplicate' });
    expect(response.status).toBe(409);
  });

  it('creates an academic term', async () => {
    const response = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `T${suffix}`.slice(0, 16),
        name: 'Fall term',
        startsOn: '2026-09-01',
        endsOn: '2027-01-15',
      });
    expect(response.status).toBe(201);
    termId = response.body.id;
  });

  it('creates a student and a lecturer', async () => {
    const studentRes = await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentCode: `SV${suffix}`.slice(0, 16),
        fullName: 'Nguyen Van A',
        status: 'active',
      });
    expect(studentRes.status).toBe(201);
    studentId = studentRes.body.id;

    const lecturerRes = await request(app.getHttpServer())
      .post('/lecturers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeCode: `GV${suffix}`.slice(0, 16),
        fullName: 'Tran Thi B',
        department: 'CNTT',
        email: `gv${suffix}@example.com`,
        phone: '0912345678',
      });
    expect(lecturerRes.status).toBe(201);
    lecturerId = lecturerRes.body.id;
  });

  it('searches students', async () => {
    const response = await request(app.getHttpServer())
      .get('/students?search=Nguyen&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.items.some((i: any) => i.id === studentId)).toBe(true);
    const match = response.body.items.find((i: any) => i.id === studentId);
    expect(match.status).toBe('active');
    expect(match.fullName).toBe('Nguyen Van A');
  });

  it('creates a course section and enrolls a student', async () => {
    const sectionRes = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId,
        academicTermId: termId,
        sectionCode: `N${suffix}`.slice(0, 16),
        name: 'Section 1',
        lecturerId,
        maxEnrollment: 2,
      });
    expect(sectionRes.status).toBe(201);
    sectionId = sectionRes.body.id;

    const sectionDetail = await request(app.getHttpServer())
      .get(`/course-sections/${sectionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sectionDetail.status).toBe(200);
    expect(sectionDetail.body.lecturerId).toBe(lecturerId);
    expect(sectionDetail.body.maxEnrollment).toBe(2);

    const enrollRes = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId });
    expect(enrollRes.status).toBe(201);

    const listRes = await request(app.getHttpServer())
      .get(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.items[0].studentId).toBe(studentId);
    expect(listRes.body.items[0].status).toBe('active');
  });

  it('allows the same section code in a different academic term', async () => {
    const otherTerm = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `U${suffix}`.slice(0, 16),
        name: 'Spring term',
        startsOn: '2027-02-01',
        endsOn: '2027-06-15',
      });
    expect(otherTerm.status).toBe(201);

    const sameCode = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId,
        academicTermId: otherTerm.body.id,
        sectionCode: `N${suffix}`.slice(0, 16),
        name: 'Same code, other term',
      });
    expect(sameCode.status).toBe(201);

    const deleteOtherSection = await request(app.getHttpServer())
      .delete(`/course-sections/${sameCode.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteOtherSection.status).toBe(204);

    const deleteOtherTerm = await request(app.getHttpServer())
      .delete(`/academic-terms/${otherTerm.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteOtherTerm.status).toBe(204);
  });

  it('rejects the same section code in the same academic term', async () => {
    const response = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId,
        academicTermId: termId,
        sectionCode: `N${suffix}`.slice(0, 16),
        name: 'Duplicate same term',
      });
    expect(response.status).toBe(409);
  });

  it('rejects the same section code in the same term for a different subject', async () => {
    const otherSubject = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `OT${suffix}`.slice(0, 16),
        name: 'Other subject',
      });
    expect(otherSubject.status).toBe(201);

    const response = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: otherSubject.body.id,
        academicTermId: termId,
        sectionCode: `N${suffix}`.slice(0, 16),
        name: 'Duplicate code other subject',
      });
    expect(response.status).toBe(409);

    const deleteOtherSubject = await request(app.getHttpServer())
      .delete(`/subjects/${otherSubject.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteOtherSubject.status).toBe(204);
  });

  it('rejects enrollment of a graduated student and over-capacity', async () => {
    const graduatedRes = await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentCode: `SX${suffix}`.slice(0, 16),
        fullName: 'Graduated Student',
        status: 'graduated',
      });
    expect(graduatedRes.status).toBe(201);

    const rejectGraduated = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: graduatedRes.body.id });
    expect(rejectGraduated.status).toBe(400);

    const second = await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentCode: `S2${suffix}`.slice(0, 16),
        fullName: 'Second Active',
        status: 'active',
      });
    expect(second.status).toBe(201);

    const enrollSecond = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: second.body.id });
    expect(enrollSecond.status).toBe(201);

    const third = await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentCode: `S3${suffix}`.slice(0, 16),
        fullName: 'Third Active',
        status: 'active',
      });
    expect(third.status).toBe(201);

    const overCap = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: third.body.id });
    expect(overCap.status).toBe(400);
  });

  it('blocks soft-deleting a subject that still has an active course section', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/subjects/${subjectId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(409);
  });

  it('blocks soft-deleting a student that still has an active enrollment', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(409);
  });

  it('unenrolls then soft-deletes the section and dependent master rows', async () => {
    const listRes = await request(app.getHttpServer())
      .get(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);

    for (const enrollment of listRes.body.items) {
      const unenroll = await request(app.getHttpServer())
        .delete(
          `/course-sections/${sectionId}/enrollments/${enrollment.id}`,
        )
        .set('Authorization', `Bearer ${adminToken}`);
      expect(unenroll.status).toBe(204);
    }

    const deleteSection = await request(app.getHttpServer())
      .delete(`/course-sections/${sectionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteSection.status).toBe(204);

    const deleteStudent = await request(app.getHttpServer())
      .delete(`/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteStudent.status).toBe(204);

    const deleteLecturer = await request(app.getHttpServer())
      .delete(`/lecturers/${lecturerId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteLecturer.status).toBe(204);

    const deleteSubject = await request(app.getHttpServer())
      .delete(`/subjects/${subjectId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteSubject.status).toBe(204);

    const deleteTerm = await request(app.getHttpServer())
      .delete(`/academic-terms/${termId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteTerm.status).toBe(204);
  });
});
