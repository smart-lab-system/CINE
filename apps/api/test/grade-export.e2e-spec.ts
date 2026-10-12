import { writeFileSync } from 'node:fs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuditLogService } from '../src/admin/audit-log.service';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { GradeExportFileStore } from '../src/grade-export/grade-export-file-store';
import { buildXlsx } from '../src/grade-export/testing/xlsx-fixture';
import { openWorkbook, readSheet } from '../src/grade-export/xlsx/workbook-reader';
import { readZipEntries } from '../src/grade-export/xlsx/zip-io';
import { ScoreService } from '../src/grading/scoring/score.service';
import { StorageService } from '../src/storage/storage.service';
import {
  GRADEBOOK_SHEET, buildGradebook, everyone, gradebookRows, loginTeacher, oneShotReviewed, planBody, seedFinalizedBase, seedGradebookWorld,
  uploadTemplate, type GradebookWorld, type Teacher,
} from './helpers/grade-export-seed';
import { forceStatus } from './helpers/grading-seed';
import { seedPrices } from './helpers/investigator-seed';

describe('Ghi điểm vào sổ điểm của giảng viên (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storage: StorageService;
  let w: GradebookWorld;
  let other: Teacher;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const preview = (body: object, t: { teacher: Teacher; ctx: { sessionId: string } } = w) =>
    http().post(`/exam-sessions/${t.ctx.sessionId}/grade-exports/preview`).set(as(t.teacher.token)).send(body);
  const write = (body: object, t: { teacher: Teacher; ctx: { sessionId: string } } = w, token = t.teacher.token) =>
    http().post(`/exam-sessions/${t.ctx.sessionId}/grade-exports`).set(as(token)).send(body);
  /** Xem trước rồi ghi với đúng digest vừa thấy — luồng của giảng viên. */
  async function exportOnce(
    templateId: string,
    over: Record<string, unknown> = {},
    extra: Record<string, unknown> = {},
    t: { teacher: Teacher; ctx: { sessionId: string } } = w,
  ) {
    const seen = await preview(planBody(templateId, over), t);
    expect(seen.status).toBe(200);
    return write({ ...planBody(templateId, over), expectedDigest: seen.body.digest, templateFileName: 'Sổ điểm N01.xlsx', ...extra }, t);
  }
  /** Cùng bước 0,5 với lượt xuất đầu: đổi sang bước 0,01 sẽ biến 5,5 thành 5,25 — một điểm GIẢM — và mọi ca sau phải xác nhận nó. */
  const HALF = { roundingStepHundredths: 50 };
  const download = async (url: string) => Buffer.from(await (await fetch(url)).arrayBuffer());
  const sheetOf = async (bytes: Buffer) => readSheet(openWorkbook(await readZipEntries(bytes)), GRADEBOOK_SHEET);
  const exportCount = async (sessionId: string) =>
    (await ds.query(`SELECT count(*)::int AS n FROM examcollect.grade_export WHERE exam_session_id = $1`, [sessionId]))[0].n as number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    storage = app.get(StorageService);
    w = await seedGradebookWorld(app, 'write');
    other = await loginTeacher(app, ds, 'write-other');
  }, 120_000);
  afterAll(async () => app.close());

  // ------------------------------------------------------------------------------------------------ Review Focus 1, 4
  it('ghi đúng các ô đã chọn; ô trống vẫn trống, có lý do; mọi phần khác của file giống hệt từng byte', async () => {
    const original = await buildGradebook(gradebookRows(everyone(w)));
    const templateId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, original);

    const res = await exportOnce(templateId, { roundingStepHundredths: 50, reasonColumn: 'E' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      fileName: 'Sổ điểm N01-da-ghi-diem.xlsx',
      summary: { written: 3, blank: 6, kept: 0, unmatched: 0, skipped: 0, overwritten: 0, decreased: 0 },
    });
    expect(res.body.blank.map((b: { row: number; reason: string }) => [b.row, b.reason])).toEqual([
      [6, 'not_finished'], [7, 'not_finished'], [8, 'ungradable'], [9, 'flagged'], [10, 'not_finished'], [11, 'absent'],
    ]);

    const out = await download(res.body.downloadUrl);
    if (process.env.GX_DUMP) writeFileSync(process.env.GX_DUMP, out); // để mở thử bằng Excel/LibreOffice (Task 16, bước 5)
    const sheet = await sheetOf(out);
    const cell = (ref: string) => sheet.cells.get(ref);
    // dòng: auto 3 · reviewed 4 · manual 5 · late 6 · notFinal 7 · ungradable 8 · flagged 9 · noResult 10 · absent 11
    expect(cell('D3')).toMatchObject({ text: '8.5', kind: 'number' });
    expect(cell('D4')).toMatchObject({ text: '6.5' });
    expect(cell('D5')).toMatchObject({ text: '5.5' }); // 5,25 nửa lên ở bước 0,5
    for (const ref of ['D6', 'D7', 'D8', 'D9', 'D10', 'D11']) expect(cell(ref)?.kind ?? 'empty').toBe('empty'); // không 0, không điểm tạm
    expect(cell('E6')?.text).toBe('Chưa chấm xong hoặc chưa chốt điểm');
    expect(cell('E7')?.text).toBe('Chưa chấm xong hoặc chưa chốt điểm'); // đã có điểm tạm 9,00 — vẫn KHÔNG ghi số
    expect(cell('E8')?.text).toBe('Hệ thống không chấm được bài');
    expect(cell('E9')?.text).toBe('Đang chờ giảng viên duyệt');
    expect(cell('E10')?.text).toBe('Chưa chấm xong hoặc chưa chốt điểm');
    expect(cell('E11')?.text).toBe('Vắng — không có bài nộp');

    // ---- bảo toàn: mọi entry khác trang tính đích và workbook.xml giống hệt byte
    const before = await readZipEntries(original);
    const after = await readZipEntries(out);
    expect(after.map((e) => e.name)).toEqual(before.map((e) => e.name));
    for (const b of before) {
      if (b.name === 'xl/worksheets/sheet1.xml' || b.name === 'xl/workbook.xml') continue;
      expect({ name: b.name, same: after.find((e) => e.name === b.name)!.data.equals(b.data) }).toEqual({ name: b.name, same: true });
    }
    const wb = (entries: typeof before) => entries.find((e) => e.name === 'xl/workbook.xml')!.data.toString();
    expect(wb(after).replace(' fullCalcOnLoad="1"', '')).toBe(wb(before));
    // ---- ...và mọi ô khác của trang tính, kể cả vùng gộp và style
    const oldSheet = readSheet(openWorkbook(before), GRADEBOOK_SHEET);
    const touched = ['D3', 'D4', 'D5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11'];
    for (const [ref, c] of oldSheet.cells) if (!touched.includes(ref)) expect({ ref, c: sheet.cells.get(ref) }).toEqual({ ref, c });
    expect(sheet.merges).toEqual(oldSheet.merges);
    expect(after.find((e) => e.name === 'xl/worksheets/sheet1.xml')!.data.toString()).toContain('<c r="D3" s="1"><v>8.5</v></c>');

    // ---- bản ghi của lượt xuất (§13.1 luật 2 và 7)
    const [row] = await ds.query(`SELECT * FROM examcollect.grade_export WHERE id = $1`, [res.body.exportId]);
    expect(row).toMatchObject({
      exam_session_id: w.ctx.sessionId, exported_by: w.teacher.id, sheet_name: GRADEBOOK_SHEET, first_data_row: 3,
      mssv_column: 'B', score_column: 'D', reason_column: 'E', required_deliverable_id: null,
      rounding_step_hundredths: 50, rounding_mode: 'half_up', unmatched_mssv_count: 0,
      written_count: 3, blank_count: 6, overwrite_count: 0, decrease_count: 0, decrease_confirmed_by: null,
      template_file_name: 'Sổ điểm N01.xlsx', output_file_name: 'Sổ điểm N01-da-ghi-diem.xlsx',
      template_storage_key: `grade-exports/${w.ctx.sessionId}/templates/${templateId}`,
      output_storage_key: `grade-exports/${w.ctx.sessionId}/outputs/${res.body.exportId}`,
    });
    expect(row.exported_at).not.toBeNull();
    expect(await storage.objectExists(row.output_storage_key)).toBe(true);

    const [g] = await ds.query(`SELECT finalized_computation_id FROM examcollect.grading_result WHERE id = $1`, [w.auto.resultId]);
    const snapshot = await ds.query(
      `SELECT mssv::text AS mssv, file_row, written_hundredths, blank_reason, score_computation_id FROM examcollect.grade_export_row WHERE grade_export_id = $1 ORDER BY file_row`,
      [res.body.exportId],
    );
    expect(snapshot).toHaveLength(9);
    expect(snapshot[0]).toEqual({ mssv: w.auto.mssv, file_row: 3, written_hundredths: 850, blank_reason: null, score_computation_id: g.finalized_computation_id });
    expect(snapshot[2]).toEqual({ mssv: w.manual.mssv, file_row: 5, written_hundredths: 550, blank_reason: null, score_computation_id: null });
    expect(snapshot.slice(3).map((r: { written_hundredths: number | null; blank_reason: string }) => [r.written_hundredths, r.blank_reason])).toEqual([
      [null, 'not_finished'], [null, 'not_finished'], [null, 'ungradable'], [null, 'flagged'], [null, 'not_finished'], [null, 'absent'],
    ]);
  });

  it('digest của bản xem trước khác → 409, và không có gì được ghi', async () => {
    const templateId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(gradebookRows(everyone(w))));
    const before = await exportCount(w.ctx.sessionId);
    const res = await write({ ...planBody(templateId), expectedDigest: 'f'.repeat(64), templateFileName: 'x.xlsx' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Kết quả chấm đã đổi kể từ lúc xem trước — hãy xem trước lại.');
    expect(await exportCount(w.ctx.sessionId)).toBe(before);
  });

  it('ghi đè ô đã có giá trị đòi cờ tường minh; có cờ thì ghi', async () => {
    const rows = gradebookRows(everyone(w));
    rows[2]![3] = 6.5;
    rows[3]![3] = 'bỏ thi';
    const templateId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(rows));
    const seen = await preview(planBody(templateId, HALF));
    expect(seen.body.overwrite).toEqual({ score: 2, reason: 0 });
    const body = { ...planBody(templateId, HALF), expectedDigest: seen.body.digest, templateFileName: 'x.xlsx' };

    const refused = await write(body);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toBe('2 ô đã có giá trị và sẽ bị ghi đè — hãy xác nhận ghi đè.');

    const ok = await write({ ...body, overwriteExisting: true });
    expect(ok.status).toBe(201);
    expect((await sheetOf(await download(ok.body.downloadUrl))).cells.get('D3')).toMatchObject({ text: '8.5' });
    const [e] = await ds.query(`SELECT overwrite_count FROM examcollect.grade_export WHERE id = $1`, [ok.body.exportId]);
    expect(e.overwrite_count).toBe(2);
  });

  it('ô có công thức được BỎ QUA nguyên vẹn (công thức và giá trị đệm còn nguyên), các dòng khác vẫn ghi', async () => {
    const rows = gradebookRows(everyone(w));
    rows[4]![3] = { formula: '1+1', value: 2 };
    const templateId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(rows));
    const res = await exportOnce(templateId, HALF);
    expect(res.status).toBe(201);
    expect(res.body.summary).toMatchObject({ written: 2, skipped: 1 });
    const sheet = await sheetOf(await download(res.body.downloadUrl));
    expect(sheet.cells.get('D5')).toMatchObject({ text: '2', hasFormula: true });
    expect(sheet.cells.get('D3')).toMatchObject({ text: '8.5', hasFormula: false });
  });

  it('MSSV trùng và trang tính bảo vệ đều chặn ghi bằng chính câu của chúng — và không tạo lượt xuất', async () => {
    const dup = gradebookRows(everyone(w));
    dup.push([12, w.auto.mssv, 'Trùng', null, null]);
    const dupId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(dup));
    const protectedId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildXlsx([{ name: GRADEBOOK_SHEET, rows: gradebookRows(everyone(w)), protect: true }]));
    const before = await exportCount(w.ctx.sessionId);
    const stub = { expectedDigest: 'a'.repeat(64), templateFileName: 'x.xlsx' };

    const d = await write({ ...planBody(dupId), ...stub });
    expect(d.status).toBe(409);
    expect(d.body.message).toBe(`1 MSSV xuất hiện nhiều lần trong file (${w.auto.mssv}). Hãy sửa file rồi tải lại — hệ thống không đoán ghi vào dòng nào.`);
    const p = await write({ ...planBody(protectedId), ...stub });
    expect(p.status).toBe(409);
    expect(p.body.message).toBe('Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.');
    expect(await exportCount(w.ctx.sessionId)).toBe(before);
  });

  it('giảng viên khác → 403; không đăng nhập → 401; body thiếu digest → 400', async () => {
    const templateId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(gradebookRows(everyone(w))));
    const body = { ...planBody(templateId), expectedDigest: 'a'.repeat(64), templateFileName: 'x.xlsx' };
    expect((await write(body, w, other.token)).status).toBe(403);
    expect((await http().post(`/exam-sessions/${w.ctx.sessionId}/grade-exports`).send(body)).status).toBe(401);
    expect((await write(planBody(templateId))).status).toBe(400);
  });

  // ------------------------------------------------------------------------------------------------ Review Focus 5
  describe('xuất lại (parent §13.1 luật 3, 4)', () => {
    it('so giá trị đã làm tròn; tách giảm khỏi tăng; nêu LUẬT gây ra; đòi xác nhận điểm giảm; ghi cột + audit_log', async () => {
      const b = await seedFinalizedBase(app, 'write-re');
      const students = [b.auto, b.reviewed, b.manual];
      const upload = async () => uploadTemplate(app, b.teacher.token, b.ctx.sessionId, await buildGradebook(gradebookRows(students)));

      // lượt 1: điểm như lúc chốt
      expect((await exportOnce(await upload(), { reasonColumn: 'E' }, {}, b)).status).toBe(201);

      // sửa giá luật `sai_bien` 1,50 → 2,50 rồi ÁP cho phiên đã chốt: bài `auto` từ 8,50 xuống 7,50
      await seedPrices(ds, b.ctx.teacherId, { [b.bien.ruleId]: '2.50', [b.ten.ruleId]: '0.50' });
      expect(await app.get(ScoreService).reapplyFinalizedSession(b.ctx.sessionId, b.ctx.teacherId)).toEqual({ changed: 1 });

      const second = await upload();
      const seen = await preview(planBody(second, { reasonColumn: 'E' }), b);
      expect(seen.body.changes).toEqual({
        previousExports: 1, up: 0, down: 1, same: 2, new: 0,
        downByCause: [{ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'sai_bien', students: 1 }],
        upByCause: [],
      });
      const autoRow = seen.body.rows.find((r: { studentMssv: string }) => r.studentMssv === b.auto.mssv);
      expect(autoRow).toMatchObject({
        direction: 'down', previousScore: '8.50', writtenScore: '7.50',
        causes: [{ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'sai_bien', delta: 100 }],
      });

      const body = { ...planBody(second, { reasonColumn: 'E' }), expectedDigest: seen.body.digest, templateFileName: 'x.xlsx' };
      const refused = await write(body, b);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe('1 bài bị giảm điểm so với lần ghi trước — hãy xem và xác nhận trước khi ghi.');

      const ok = await write({ ...body, confirmDecreases: true }, b);
      expect(ok.status).toBe(201);
      expect(ok.body.summary.decreased).toBe(1);
      const [e] = await ds.query(`SELECT decrease_count, decrease_confirmed_by FROM examcollect.grade_export WHERE id = $1`, [ok.body.exportId]);
      expect(e).toEqual({ decrease_count: 1, decrease_confirmed_by: b.teacher.id });
      const audit = await ds.query(
        `SELECT actor_id, target_type, new_value FROM examcollect.audit_log WHERE action = 'grade_export.score_decreased_confirmed' AND target_id = $1`,
        [ok.body.exportId],
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actor_id: b.teacher.id, target_type: 'grade_export' });
      expect(audit[0].new_value.decreased).toEqual([
        { mssv: b.auto.mssv, before: '8.50', after: '7.50', causes: [{ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'sai_bien', delta: 100 }] },
      ]);

      // lượt 3: chỉ đổi bước làm tròn — 5,25 → 5,5 là TĂNG, nhưng nguyên nhân là làm tròn, không phải một luật
      const third = await preview(planBody(await upload(), { roundingStepHundredths: 50 }), b);
      expect(third.body.changes).toMatchObject({ previousExports: 2, up: 1, down: 0 });
      expect(third.body.changes.upByCause).toEqual([{ kind: 'rounding', ruleKey: null, ruleName: null, students: 1 }]);
    });

    it('sinh viên đã ghi mà nay chưa xong → GIỮ NGUYÊN ô điểm; nhãn lý do cũ của ta bị xoá khi sinh viên đã có điểm', async () => {
      const k = await seedFinalizedBase(app, 'write-keep');
      const late = { ...(await oneShotReviewed(ds, k.ctx, '4.00')), name: 'Nộp muộn' };
      const [sub] = await ds.query(`SELECT student_mssv AS mssv FROM examcollect.submission WHERE id = $1`, [late.submissionId]);
      const lateStudent = { ...late, mssv: sub.mssv as string };
      const students = [k.auto, k.reviewed, k.manual, lateStudent];

      // lượt 1: `late` chưa chốt → ô điểm trống + nhãn lý do
      const first = await exportOnce(await uploadTemplate(app, k.teacher.token, k.ctx.sessionId, await buildGradebook(gradebookRows(students))), { reasonColumn: 'E' }, {}, k);
      expect(first.status).toBe(201);
      const firstBytes = await download(first.body.downloadUrl);
      expect((await sheetOf(firstBytes)).cells.get('E6')?.text).toBe('Chưa chấm xong hoặc chưa chốt điểm');

      // `late` được chốt; `reviewed` bị đẩy ra NGOÀI máy trạng thái (bỏ qua trigger) về "đang chờ duyệt"
      await forceStatus(ds, late.resultId, 'finalized', { finalized_by: k.teacher.id, finalized_at: new Date() });
      await forceStatus(ds, k.reviewed.resultId!, 'flagged_for_review');

      // lượt 2 lên CHÍNH file lượt 1 — nên ô E6 đang mang nhãn cũ và ô D4 mang 6,5
      const secondId = await uploadTemplate(app, k.teacher.token, k.ctx.sessionId, firstBytes);
      const seen = await preview(planBody(secondId, { reasonColumn: 'E' }), k);
      expect(seen.body.summary).toMatchObject({ write: 3, kept: 1, blank: 0 });
      const kept = seen.body.rows.find((r: { studentMssv: string }) => r.studentMssv === k.reviewed.mssv);
      expect(kept).toMatchObject({ action: 'kept', writtenScore: null, previousScore: '6.50', blankReason: 'flagged' });
      expect(kept.note).toBe('Lần trước đã ghi 6,5; lần này bài đang chờ giảng viên duyệt — giữ nguyên ô điểm.');
      expect(seen.body.overwrite).toEqual({ score: 0, reason: 0 }); // nhãn của chính ta không phải "giá trị"

      const second = await write({ ...planBody(secondId, { reasonColumn: 'E' }), expectedDigest: seen.body.digest, templateFileName: 'x.xlsx' }, k);
      expect(second.status).toBe(201);
      const sheet = await sheetOf(await download(second.body.downloadUrl));
      expect(sheet.cells.get('D6')).toMatchObject({ text: '4', kind: 'number' }); // `late` giờ có điểm
      expect(sheet.cells.get('E6')?.kind ?? 'empty').toBe('empty'); // nhãn cũ của ta đã bị xoá
      expect(sheet.cells.get('D4')).toMatchObject({ text: '6.5' }); // `reviewed` GIỮ NGUYÊN, không bị xoá
      expect(sheet.cells.get('E4')?.text).toBe('Đang chờ giảng viên duyệt');
      const rows = await ds.query(
        `SELECT mssv::text AS mssv, written_hundredths, blank_reason FROM examcollect.grade_export_row WHERE grade_export_id = $1 AND mssv = $2`,
        [second.body.exportId, k.reviewed.mssv],
      );
      expect(rows).toEqual([{ mssv: k.reviewed.mssv, written_hundredths: null, blank_reason: 'flagged' }]);
    });
  });

  // ------------------------------------------------------------------------------------------------ D19
  it('upload xong mà ghi DB hỏng → xoá object vừa đưa lên và không có dòng nào của lượt đó', async () => {
    const c = await seedFinalizedBase(app, 'write-clean');
    const upload = async () => uploadTemplate(app, c.teacher.token, c.ctx.sessionId, await buildGradebook(gradebookRows([c.auto, c.reviewed, c.manual])));
    expect((await exportOnce(await upload(), {}, {}, c)).status).toBe(201);
    await seedPrices(ds, c.ctx.teacherId, { [c.bien.ruleId]: '2.50', [c.ten.ruleId]: '0.50' });
    await app.get(ScoreService).reapplyFinalizedSession(c.ctx.sessionId, c.ctx.teacherId);

    const second = await upload();
    const seen = await preview(planBody(second), c);
    const put = jest.spyOn(app.get(GradeExportFileStore), 'put');
    const audit = jest.spyOn(app.get(AuditLogService), 'recordUserAction').mockRejectedValueOnce(new Error('audit down'));
    try {
      const res = await write({ ...planBody(second), expectedDigest: seen.body.digest, templateFileName: 'x.xlsx', confirmDecreases: true }, c);
      expect(res.status).toBe(500);
      const key = put.mock.calls[0]![0];
      expect(key).toContain(`grade-exports/${c.ctx.sessionId}/outputs/`);
      expect(await storage.objectExists(key)).toBe(false);
      expect(await exportCount(c.ctx.sessionId)).toBe(1); // chỉ lượt 1
    } finally {
      put.mockRestore();
      audit.mockRestore();
    }
  });
});
