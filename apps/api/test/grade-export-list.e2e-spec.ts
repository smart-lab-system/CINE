import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { ScoreService } from '../src/grading/scoring/score.service';
import { StorageService } from '../src/storage/storage.service';
import { buildGradebook, gradebookRows, loginTeacher, planBody, seedFinalizedBase, uploadTemplate, type FinalizedBase, type Teacher } from './helpers/grade-export-seed';
import { seedPrices } from './helpers/investigator-seed';
import { seedSession } from './helpers/grading-seed';

describe('Danh sách lượt xuất và tải file (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let b: FinalizedBase;
  let other: Teacher;
  let first: { exportId: string; fileName: string };
  let second: { exportId: string; fileName: string };

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = (token = b.teacher.token, sessionId = b.ctx.sessionId) => http().get(`/exam-sessions/${sessionId}/grade-exports`).set(as(token));
  const download = (id: string, token = b.teacher.token) => http().get(`/grade-exports/${id}/download`).set(as(token));

  async function exportOnce(over: Record<string, unknown>, extra: Record<string, unknown>, fileName: string) {
    const templateId = await uploadTemplate(app, b.teacher.token, b.ctx.sessionId, await buildGradebook(gradebookRows([b.auto, b.reviewed, b.manual])));
    const seen = await http().post(`/exam-sessions/${b.ctx.sessionId}/grade-exports/preview`).set(as(b.teacher.token)).send(planBody(templateId, over));
    const res = await http()
      .post(`/exam-sessions/${b.ctx.sessionId}/grade-exports`)
      .set(as(b.teacher.token))
      .send({ ...planBody(templateId, over), expectedDigest: seen.body.digest, templateFileName: fileName, ...extra });
    expect(res.status).toBe(201);
    return res.body as { exportId: string; fileName: string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    b = await seedFinalizedBase(app, 'list');
    other = await loginTeacher(app, ds, 'list-other');
    first = await exportOnce({ reasonColumn: 'E' }, {}, 'Sổ điểm N01.xlsx');
    await seedPrices(ds, b.ctx.teacherId, { [b.bien.ruleId]: '2.50', [b.ten.ruleId]: '0.50' });
    await app.get(ScoreService).reapplyFinalizedSession(b.ctx.sessionId, b.ctx.teacherId);
    second = await exportOnce({ roundingStepHundredths: 50, reasonColumn: 'E' }, { confirmDecreases: true }, 'Sổ điểm N01 (lại).xlsx');
  }, 120_000);
  afterAll(async () => app.close());

  it('liệt kê các lượt của phiên, mới nhất trước, với đủ thứ giảng viên cần để nhận ra lượt nào là lượt nào', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.map((e: { id: string }) => e.id)).toEqual([second.exportId, first.exportId]);
    expect(res.body[1]).toEqual({
      id: first.exportId, exportedAt: expect.any(String), sheetName: 'Bảng điểm', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: 'E',
      deliverableName: null, roundingStepHundredths: 1, written: 3, blank: 0, unmatched: 0, overwritten: 0, decreased: 0, decreaseConfirmedBy: null,
      exportedByName: 'Test Account', templateFileName: 'Sổ điểm N01.xlsx', outputFileName: 'Sổ điểm N01-da-ghi-diem.xlsx',
    });
  });

  it('lượt có điểm giảm ghi tên người đã xác nhận, và bước làm tròn đã dùng', async () => {
    const [latest] = (await list()).body;
    expect(latest).toMatchObject({ roundingStepHundredths: 50, decreased: 1, decreaseConfirmedBy: 'Test Account' });
  });

  it('một phiên khác của cùng giảng viên không thấy lượt của phiên này', async () => {
    const empty = (await seedSession(ds, 'gx-list-empty', { teacherId: b.teacher.id, startHoursAgo: 8 })).sessionId;
    const res = await list(b.teacher.token, empty);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('tải: URL ký cho ĐÚNG file đã ghi, kèm tên file', async () => {
    const res = await download(first.exportId);
    expect(res.status).toBe(200);
    expect(res.body.fileName).toBe('Sổ điểm N01-da-ghi-diem.xlsx');
    const [row] = await ds.query(`SELECT output_storage_key FROM examcollect.grade_export WHERE id = $1`, [first.exportId]);
    const served = Buffer.from(await (await fetch(res.body.downloadUrl)).arrayBuffer());
    expect(served.equals(await app.get(StorageService).getObject(row.output_storage_key))).toBe(true);
  });

  it('lượt không tồn tại → 404 tiếng Việt; id không phải uuid → 400', async () => {
    const missing = await download(randomUUID());
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('Không tìm thấy lượt xuất này.');
    expect((await download('abc')).status).toBe(400);
  });

  it('giảng viên khác không liệt kê và không tải được → 403; không đăng nhập → 401', async () => {
    expect((await list(other.token)).status).toBe(403);
    expect((await download(first.exportId, other.token)).status).toBe(403);
    expect((await http().get(`/exam-sessions/${b.ctx.sessionId}/grade-exports`)).status).toBe(401);
    expect((await http().get(`/grade-exports/${first.exportId}/download`)).status).toBe(401);
  });
});
