import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { buildXlsx } from '../src/grade-export/testing/xlsx-fixture';
import { loadCurrentScore } from '../src/grading/scoring/score-inputs';
import {
  GRADEBOOK_SHEET, buildGradebook, everyone, gradebookRows, loginTeacher, planBody, seedFinalizedBase, seedGradebookWorld,
  uploadTemplate, type GradebookWorld, type Teacher,
} from './helpers/grade-export-seed';
import { seedSession } from './helpers/grading-seed';

interface PreviewRow { row: number; studentMssv: string | null; action: string; systemScore: string | null; writtenScore: string | null; blankReason: string | null; blankLabel: string | null; note: string | null; direction: string | null }

describe('Xem trước ghi điểm vào sổ điểm (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let w: GradebookWorld;
  let other: Teacher;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const preview = (body: object, token = w.teacher.token, sessionId = w.ctx.sessionId) =>
    http().post(`/exam-sessions/${sessionId}/grade-exports/preview`).set(as(token)).send(body);
  const upload = async (rows = gradebookRows(everyone(w))) => uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(rows));
  const rowOf = (body: { rows: PreviewRow[] }, mssv: string) => body.rows.find((r) => r.studentMssv === mssv)!;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    w = await seedGradebookWorld(app, 'prev');
    other = await loginTeacher(app, ds, 'prev-other');
  }, 120_000);
  afterAll(async () => app.close());

  it('ba con số, từng dòng, điểm làm tròn nửa lên ở bước 0,5 — và điểm hệ thống nằm cạnh giá trị sẽ ghi', async () => {
    const res = await preview(planBody(await upload(), { roundingStepHundredths: 50, reasonColumn: 'E' }));
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ write: 3, blank: 6, kept: 0, unmatched: 0, duplicates: 0, skipped: 0, ignoredEmpty: 0, notInFile: 0 });
    expect(res.body).toMatchObject({ canWrite: true, blockers: [], changes: null, overwrite: { score: 0, reason: 0 }, roundingStepHundredths: 50, deliverableId: null, notInFile: [] });
    expect(res.body.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(rowOf(res.body, w.auto.mssv)).toMatchObject({ row: 3, action: 'write', systemScore: '8.50', writtenScore: '8.50', direction: null });
    expect(rowOf(res.body, w.reviewed.mssv)).toMatchObject({ action: 'write', systemScore: '6.50', writtenScore: '6.50' });
    expect(rowOf(res.body, w.manual.mssv)).toMatchObject({ action: 'write', systemScore: '5.25', writtenScore: '5.50' });
  });

  // Review Focus 4: một con số tạm trong file chính thức bị hiểu là điểm cuối.
  it('bài đã có điểm tạm 9,00 nhưng CHƯA CHỐT là ô trống có lý do — không bao giờ một con số', async () => {
    const res = await preview(planBody(await upload(), { reasonColumn: 'E' }));
    expect(rowOf(res.body, w.notFinal.mssv)).toMatchObject({ action: 'blank', systemScore: null, writtenScore: null, blankReason: 'not_finished', blankLabel: 'Chưa chấm xong hoặc chưa chốt điểm' });
  });

  it('bốn nghĩa của ô trống, mỗi nghĩa một nhãn', async () => {
    const res = await preview(planBody(await upload()));
    const at = (s: { mssv: string }) => rowOf(res.body, s.mssv);
    expect([at(w.late), at(w.noResult)].map((r) => r.blankReason)).toEqual(['not_finished', 'not_finished']);
    expect(at(w.ungradable)).toMatchObject({ blankReason: 'ungradable', blankLabel: 'Hệ thống không chấm được bài' });
    expect(at(w.flagged)).toMatchObject({ blankReason: 'flagged', blankLabel: 'Đang chờ giảng viên duyệt' });
    expect(at(w.absent)).toMatchObject({ blankReason: 'absent', blankLabel: 'Vắng — không có bài nộp' });
  });

  // Review Focus 2.
  it('điểm hệ thống của từng bài đã chốt bằng đúng `loadCurrentScore`', async () => {
    const res = await preview(planBody(await upload()));
    for (const s of [w.auto, w.reviewed, w.manual]) {
      const current = await loadCurrentScore(ds.manager, s.resultId!);
      expect(Number(rowOf(res.body, s.mssv).systemScore)).toBe(current.value);
    }
  });

  it('dòng lạ, dòng trống xen kẽ và tiêu đề: không khớp thì báo, dòng trống thì đếm riêng, tiêu đề không bị tính', async () => {
    const rows = gradebookRows(everyone(w));
    rows.push([12, '99999999', 'Người lạ', null, null], [13, '', 'Dòng không có MSSV', null, null]);
    const res = await preview(planBody(await upload(rows)));
    expect(res.body.summary).toMatchObject({ write: 3, blank: 6, unmatched: 1, ignoredEmpty: 1 });
    expect(res.body.rows.find((r: PreviewRow) => r.action === 'unmatched')).toMatchObject({ row: 12, note: 'Không có trong danh sách sinh viên của phiên.' });
  });

  it('sinh viên có trong phiên mà file không có dòng: báo riêng, không thêm vào file', async () => {
    const res = await preview(planBody(await upload(gradebookRows(everyone(w)).slice(0, 4))));
    expect(res.body.summary.notInFile).toBe(7);
    expect(res.body.notInFile.map((s: { mssv: string }) => s.mssv)).toContain(w.absent.mssv);
    expect(res.body.notInFile.find((s: { mssv: string }) => s.mssv === w.manual.mssv)).toMatchObject({ score: '5.25', blankReason: null });
  });

  it('MSSV trùng trong file chặn việc ghi (vẫn xem trước được) và cả hai dòng đều báo trùng', async () => {
    const rows = gradebookRows(everyone(w));
    rows.push([12, w.auto.mssv, 'Trùng', null, null]);
    const res = await preview(planBody(await upload(rows)));
    expect(res.status).toBe(200);
    expect(res.body.canWrite).toBe(false);
    expect(res.body.blockers[0]).toBe(`1 MSSV xuất hiện nhiều lần trong file (${w.auto.mssv}). Hãy sửa file rồi tải lại — hệ thống không đoán ghi vào dòng nào.`);
    expect(res.body.rows.filter((r: PreviewRow) => r.action === 'duplicate').map((r: PreviewRow) => r.row)).toEqual([3, 12]);
  });

  it('ô điểm có công thức thì bỏ qua dòng đó, nói lý do', async () => {
    const rows = gradebookRows(everyone(w));
    rows[2]![3] = { formula: '1+1', value: 2 };
    const res = await preview(planBody(await upload(rows)));
    expect(res.body.summary).toMatchObject({ write: 2, skipped: 1 });
    expect(rowOf(res.body, w.auto.mssv)).toMatchObject({ action: 'skipped_formula', note: 'Ô điểm có công thức — không ghi.' });
  });

  it('đếm số ô sẽ bị ghi đè: ô đã có số KHÁC, ô có chữ; ô đã đúng giá trị sắp ghi thì không tính', async () => {
    const rows = gradebookRows(everyone(w));
    rows[2]![3] = 6.5; // 8,5 sẽ thay 6,5
    rows[3]![3] = 'bỏ thi'; // chữ
    rows[4]![3] = 5.5; // bước 0,5 sẽ ghi đúng 5,5
    const res = await preview(planBody(await upload(rows), { roundingStepHundredths: 50 }));
    expect(res.body.overwrite).toEqual({ score: 2, reason: 0 });
  });

  it('trang tính đang được bảo vệ chặn cả lượt', async () => {
    const bytes = await buildXlsx([{ name: GRADEBOOK_SHEET, rows: gradebookRows(everyone(w)), protect: true }]);
    const res = await preview(planBody(await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, bytes)));
    expect(res.body).toMatchObject({ canWrite: false, blockers: ['Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.'] });
  });

  it('digest ổn định qua hai lần xem, và đổi khi đổi bước làm tròn', async () => {
    const id = await upload();
    const a = await preview(planBody(id));
    const b = await preview(planBody(id));
    const c = await preview(planBody(id, { roundingStepHundredths: 50 }));
    expect(a.body.digest).toBe(b.body.digest);
    expect(c.body.digest).not.toBe(a.body.digest);
  });

  it('phiên chưa chốt điểm → 409, dù file hợp lệ', async () => {
    const empty = (await seedSession(ds, 'gx-prev-empty', { teacherId: w.teacher.id, startHoursAgo: 8 })).sessionId;
    const id = await uploadTemplate(app, w.teacher.token, empty, await buildGradebook(gradebookRows([])));
    const res = await preview(planBody(id), w.teacher.token, empty);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.');
  });

  it('các đầu vào sai đều là 400 tiếng Việt nói cần sửa gì', async () => {
    const id = await upload();
    const say = async (over: Record<string, unknown>) => (await preview(planBody(id, over))).body.message;
    expect(await say({ scoreColumn: 'B' })).toBe('Cột MSSV, cột điểm và cột lý do phải là ba cột khác nhau.');
    expect(await say({ reasonColumn: 'D' })).toBe('Cột MSSV, cột điểm và cột lý do phải là ba cột khác nhau.');
    expect(await say({ mssvColumn: 'BI' })).toBe('Cột BI nằm ngoài giới hạn (tối đa cột BH).');
    expect(await say({ sheetName: 'Không có' })).toBe('Không thấy trang tính "Không có" trong file.');
    expect(await say({ deliverableId: randomUUID() })).toBe('Yêu cầu nộp này không thuộc phiên thi.');
    expect((await preview(planBody(id, { roundingStepHundredths: 5 }))).status).toBe(400);
    expect((await preview(planBody(id, { mssvColumn: 'b' }))).status).toBe(400);
    expect((await preview(planBody(id, { firstDataRow: 0 }))).status).toBe(400);
  });

  it('quá 2000 dòng dữ liệu → 400', async () => {
    const many = Array.from({ length: 2100 }, (_, i) => ({ mssv: `SV${String(i).padStart(6, '0')}`, name: 'x' }));
    const res = await preview(planBody(await upload(gradebookRows(many))));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Quá 2000 dòng dữ liệu — hãy tách file.');
  });

  it('giảng viên khác → 403; không đăng nhập → 401', async () => {
    const id = await upload();
    expect((await preview(planBody(id), other.token)).status).toBe(403);
    expect((await http().post(`/exam-sessions/${w.ctx.sessionId}/grade-exports/preview`).send(planBody(id))).status).toBe(401);
  });

  describe('ô số mất số 0 đầu', () => {
    it('khớp MỘT MSSV của phiên và dòng đó nói rõ đã khớp bằng cách nào', async () => {
      const z = await seedFinalizedBase(app, 'prev-zero');
      await ds.query(
        `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id, source) VALUES ($1, '0012345', 'Có số 0', $2, $3, 'manual')`,
        [z.ctx.sessionId, z.ctx.classId, z.ctx.teacherId],
      );
      const rows = gradebookRows([z.auto, { mssv: '', name: 'Có số 0' }]);
      rows[3]![1] = 12345; // ô SỐ — Excel không giữ được số 0 đầu
      const id = await uploadTemplate(app, z.teacher.token, z.ctx.sessionId, await buildGradebook(rows));
      const res = await preview(planBody(id), z.teacher.token, z.ctx.sessionId);
      expect(res.body.rows.find((r: PreviewRow) => r.row === 4)).toMatchObject({ studentMssv: '0012345', action: 'blank', blankReason: 'absent', note: 'Khớp sau khi bỏ số 0 đầu (ô số).' });
    });
  });

  describe('phiên có nhiều yêu cầu nộp (D7)', () => {
    it('phải chọn yêu cầu nào; điểm không bao giờ được cộng', async () => {
      const m = await seedFinalizedBase(app, 'prev-multi');
      await ds.query(`INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type) VALUES ($1, 'Cau2.docx', 'document')`, [m.ctx.sessionId]);
      const [second] = await ds.query(`SELECT id FROM examcollect.required_deliverable WHERE exam_session_id = $1 AND required_filename = 'Cau2.docx'`, [m.ctx.sessionId]);
      const id = await uploadTemplate(app, m.teacher.token, m.ctx.sessionId, await buildGradebook(gradebookRows([m.auto, m.reviewed, m.manual])));
      const call = (over: Record<string, unknown>) => preview(planBody(id, over), m.teacher.token, m.ctx.sessionId);

      const none = await call({});
      expect(none.status).toBe(400);
      expect(none.body.message).toBe('Phiên có 2 yêu cầu nộp — hãy chọn ghi điểm của yêu cầu nào.');
      const first = await call({ deliverableId: m.ctx.deliverableId });
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ deliverableId: m.ctx.deliverableId, summary: { write: 3 } });
      const empty = await call({ deliverableId: second.id });
      expect(empty.status).toBe(409); // yêu cầu này chưa có bài nào được chốt
    });
  });
});
