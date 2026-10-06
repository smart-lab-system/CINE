import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { randomTag } from './helpers/master-data';
import { openSession } from './helpers/open-session';
import { ensureRoom, seedClass, seedEnrollment, sessionBody } from './helpers/seed';

/**
 * Review cụm F, I1. "Mở phiên thi" gieo một dòng `not_submitted` cho MỌI sinh viên của lớp (§7.1.2), và spec §4.1 cố ý giữ
 * các dòng đó khi huỷ phiên. Luồng khuyến nghị khi tạo sai là "huỷ rồi tạo lại": mở C → huỷ C → tạo N cùng lớp, cùng loại kỳ thi.
 *
 * Nếu cột "có mặt ở phiên khác" của bản tổng quan bài thu coi dòng `not_submitted` là dấu vết, thì ở N mọi sinh viên VẮNG
 * thi đều rơi vào "thi bù ở phiên khác" (mức trung tính, xếp cuối) thay vì "vắng thi" (mức cảnh báo): sự vắng mặt bị giấu.
 */
describe('Bản tổng quan bài thu — phiên đã huỷ không làm sinh viên vắng thành "thi bù" (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let teacherId: string;

  const tag = randomTag(8);
  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const email = `ovcancel_${tag}@example.com`.toLowerCase();
    teacherId = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD })).body.accessToken;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function createSession(classId: string, roomId: string, startTime: string, endTime: string) {
    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set(auth())
      .send(await sessionBody(ds, { classId, roomId, startTime, endTime, name: `Phiên OVC ${tag} ${Math.random().toString(36).slice(2, 7)}` }));
    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  async function overviewOf(sessionId: string) {
    const response = await request(app.getHttpServer()).get('/submissions/overview').set(auth()).expect(200);
    const found = (response.body.items as Array<Record<string, unknown>>).find((item) => item.id === sessionId);
    if (!found) throw new Error(`phiên ${sessionId} không có trong bản tổng quan`);
    return found as Record<string, number>;
  }

  it('mở → huỷ → tạo lại cùng lớp và loại kỳ thi: hai sinh viên vắng vẫn là "vắng thi", không phải "thi bù ở phiên khác"', async () => {
    const klass = await seedClass(ds, { teacherId });
    for (const mssv of [`OA${tag}`, `OB${tag}`]) {
      await seedEnrollment(ds, { classId: klass.id, teacherId, mssv, name: `Sinh vien ${mssv}` });
    }
    const room = await ensureRoom(ds, `OVC ${tag} phong`);
    const start = new Date(Date.now() + 40 * 24 * 3_600_000);
    const startTime = start.toISOString();
    const endTime = new Date(start.getTime() + 2 * 3_600_000).toISOString();

    const cancelled = await createSession(klass.id, room.id, startTime, endTime);
    await openSession(app, token, cancelled); // gieo not_submitted cho cả hai sinh viên
    const [{ n: seeded }] = await ds.query(
      `SELECT count(*)::int AS n FROM examcollect.submission WHERE exam_session_id = $1 AND status = 'not_submitted'`,
      [cancelled],
    );
    expect(seeded).toBeGreaterThan(0);
    await request(app.getHttpServer()).post(`/exam-sessions/${cancelled}/cancel`).set(auth()).send({}).expect(200);

    // Phòng, lớp và giãn cách đã nhả nên tạo lại ĐÚNG khung giờ cũ được.
    const replacement = await createSession(klass.id, room.id, startTime, endTime);

    const item = await overviewOf(replacement);
    expect(item.expectedCount).toBe(2);
    expect(item.neverAttendedCount).toBe(2);
    expect(item.satElsewhereCount).toBe(0);
  }, 60_000);
});
