import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { buildXlsx, type FixtureCell } from '../../src/grade-export/testing/xlsx-fixture';
import { ScoreService } from '../../src/grading/scoring/score.service';
import { TeacherReviewService } from '../../src/grading/teacher-review.service';
import { createTestAccount } from './create-account';
import { forceStatus, scoreResult, seedResult, seedSession, SeedSession } from './grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './investigator-seed';

export interface WorldStudent {
  resultId: string | null;
  submissionId: string | null;
  mssv: string;
  name: string;
}

export interface Teacher {
  id: string;
  token: string;
  email: string;
}

/**
 * Phiên ĐÃ CHỐT với ba sinh viên có điểm — đủ cho mọi ca xuất lại (áp giá mới cho phiên đã chốt cần MỌI bài đã chốt):
 *
 *   auto      — đường điều tra, tự quyết → chốt: 8,50 (nguồn `finalized`, có lượt tính)
 *   reviewed  — tự luận, giảng viên duyệt 6,50 → chốt (nguồn `review`, không có lượt tính)
 *   manual    — đường điều tra, giảng viên chấm tay 5,25 → chốt (nguồn `manual`)
 */
export interface FinalizedBase {
  ctx: SeedSession;
  teacher: Teacher;
  bien: { ruleId: string; revisionId: string };
  ten: { ruleId: string; revisionId: string };
  auto: WorldStudent;
  reviewed: WorldStudent;
  manual: WorldStudent;
}

/**
 * Thêm các loại sinh viên KHÔNG có điểm để ghi — mọi bài này đến SAU khi chốt, nên ô của họ trống có lý do:
 *
 *   late        — đang chấm                                              → not_finished
 *   notFinal    — giảng viên duyệt 9,00 nhưng CHƯA CHỐT                  → not_finished (điểm tạm KHÔNG ra ngoài)
 *   ungradable  — không chấm được (system)                               → ungradable
 *   flagged     — đang gắn cờ chờ duyệt                                  → flagged
 *   noResult    — có bài nộp nhưng chưa từng chấm                        → not_finished
 *   absent      — chỉ có trong session_roster                            → absent
 */
export interface GradebookWorld extends FinalizedBase {
  late: WorldStudent;
  notFinal: WorldStudent;
  ungradable: WorldStudent;
  flagged: WorldStudent;
  noResult: WorldStudent;
  absent: WorldStudent;
}

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];
const stamp = Date.now();

export async function studentOf(ds: DataSource, r: { resultId: string; submissionId: string }): Promise<WorldStudent> {
  const [s] = await ds.query(`SELECT student_mssv AS mssv, student_name_input AS name FROM examcollect.submission WHERE id = $1`, [r.submissionId]);
  return { resultId: r.resultId, submissionId: r.submissionId, mssv: s.mssv as string, name: s.name as string };
}

export async function loginTeacher(app: INestApplication, ds: DataSource, label: string): Promise<Teacher> {
  const email = `gx_${label}_${stamp}@example.com`;
  const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
  const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
  return { id, token: res.body.accessToken as string, email };
}

/** Bài tự luận: AI chấm, gắn cờ (mọi bài one_shot), giảng viên duyệt `finalScore`, sang `teacher_reviewed`. */
export async function oneShotReviewed(ds: DataSource, ctx: SeedSession, finalScore: string): Promise<{ resultId: string; submissionId: string }> {
  const r = await seedResult(ds, ctx);
  await scoreResult(ds, r.resultId, '7.00');
  await ds.query(`UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`, [r.resultId]);
  await ds.query(`INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score) VALUES ($1, $2, $3)`, [r.resultId, ctx.teacherId, finalScore]);
  await ds.query(`UPDATE examcollect.grading_result SET status = 'teacher_reviewed' WHERE id = $1`, [r.resultId]);
  return r;
}

export async function seedFinalizedBase(app: INestApplication, label: string): Promise<FinalizedBase> {
  const ds = app.get(DataSource);
  const scores = app.get(ScoreService);
  const teacher = await loginTeacher(app, ds, label);
  const ctx = await seedSession(ds, `gx-${label}`, { teacherId: teacher.id, deliverableType: 'code_project', language: 'cpp' });
  await seedInvestigatorSession(ds, ctx);
  const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
  const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
  await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });

  const investigator = async (): Promise<{ resultId: string; submissionId: string }> => {
    const seeded = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await scores.computeInitial(seeded.resultId);
    const [g] = await ds.query(`SELECT submission_id FROM examcollect.grading_result WHERE id = $1`, [seeded.resultId]);
    return { resultId: seeded.resultId, submissionId: g.submission_id as string };
  };

  const autoSeed = await investigator(); // tự quyết → auto_approved, 8,50
  const manualSeed = await investigator();
  await ds.query(
    `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind) VALUES ($1, $2, '5.25', 'manual_score')`,
    [manualSeed.resultId, ctx.teacherId],
  );
  await ds.query(`UPDATE examcollect.grading_result SET status = 'teacher_reviewed' WHERE id = $1`, [manualSeed.resultId]);
  const reviewedSeed = await oneShotReviewed(ds, ctx, '6.50');

  await app.get(TeacherReviewService).finalizeGrades(ctx.sessionId, ctx.teacherId);
  return {
    ctx, teacher, bien, ten,
    auto: await studentOf(ds, autoSeed),
    reviewed: await studentOf(ds, reviewedSeed),
    manual: await studentOf(ds, manualSeed),
  };
}

export async function seedGradebookWorld(app: INestApplication, label: string): Promise<GradebookWorld> {
  const ds = app.get(DataSource);
  const base = await seedFinalizedBase(app, label);
  const { ctx } = base;

  const late = await studentOf(ds, await seedResult(ds, ctx));
  const notFinal = await studentOf(ds, await oneShotReviewed(ds, ctx, '9.00'));

  const ungradableSeed = await seedResult(ds, ctx);
  await forceStatus(ds, ungradableSeed.resultId, 'flagged_for_review', { ungradable_class: 'system', ungradable_reason: 'hết giờ', confidence: 0 });
  const ungradable = await studentOf(ds, ungradableSeed);

  const flaggedSeed = await seedResult(ds, ctx);
  await scoreResult(ds, flaggedSeed.resultId, '4.00');
  await ds.query(`UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`, [flaggedSeed.resultId]);
  const flagged = await studentOf(ds, flaggedSeed);

  const noResultMssv = `NR${String(stamp).slice(-8)}`;
  const [noResultSub] = await ds.query(
    `INSERT INTO examcollect.submission (exam_session_id, required_deliverable_id, student_mssv, student_name_input, home_class_id, home_teacher_id, status)
     VALUES ($1, $2, $3, 'Chưa chấm', $4, $5, 'received') RETURNING id`,
    [ctx.sessionId, ctx.deliverableId, noResultMssv, ctx.classId, ctx.teacherId],
  );
  const noResult: WorldStudent = { resultId: null, submissionId: noResultSub.id as string, mssv: noResultMssv, name: 'Chưa chấm' };

  const absentMssv = `AB${String(stamp).slice(-8)}`;
  await ds.query(
    `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id, source)
     VALUES ($1, $2, 'Sinh viên vắng', $3, $4, 'manual')`,
    [ctx.sessionId, absentMssv, ctx.classId, ctx.teacherId],
  );
  const absent: WorldStudent = { resultId: null, submissionId: null, mssv: absentMssv, name: 'Sinh viên vắng' };

  return { ...base, late, notFinal, ungradable, flagged, noResult, absent };
}

/** Chín người của thế giới, theo thứ tự cố định — dòng 3 → 11 của sổ điểm mẫu. */
export const everyone = (w: GradebookWorld): WorldStudent[] => [w.auto, w.reviewed, w.manual, w.late, w.notFinal, w.ungradable, w.flagged, w.noResult, w.absent];

// ---- sổ điểm mẫu và các lời gọi HTTP dùng chung ------------------------------------------------------------------
export const GRADEBOOK_SHEET = 'Bảng điểm';

/** Tựa đề (dòng 1, gộp A1:E1), tiêu đề (dòng 2), rồi mỗi sinh viên một dòng từ dòng 3: STT · MSSV · Họ tên · Điểm · Ghi chú. */
export function gradebookRows(students: { mssv: string; name: string }[]): FixtureCell[][] {
  return [
    ['BẢNG ĐIỂM LỚP N01'],
    ['STT', 'MSSV', 'Họ tên', 'Điểm', 'Ghi chú'],
    ...students.map((s, i): FixtureCell[] => [i + 1, s.mssv, s.name, null, null]),
  ];
}

/** Cột D (Điểm) mang style `s=1` kể cả ô rỗng — như một sổ điểm thật đã định dạng sẵn. */
export const buildGradebook = (rows: FixtureCell[][]): Promise<Buffer> =>
  buildXlsx([{ name: GRADEBOOK_SHEET, rows, merges: ['A1:E1'], columnStyle: { 4: 1 } }]);

export const DEFAULT_PLAN = { sheetName: GRADEBOOK_SHEET, firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', roundingStepHundredths: 1 } as const;

export const planBody = (templateId: string, over: Record<string, unknown> = {}) => ({ templateId, ...DEFAULT_PLAN, ...over });

/** Mint URL → PUT byte thẳng lên MinIO → trả templateId (đúng luồng của trình duyệt). */
export async function uploadTemplate(app: INestApplication, token: string, sessionId: string, bytes: Buffer, fileName = 'so-diem.xlsx'): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(`/exam-sessions/${sessionId}/grade-exports/template-upload`)
    .set({ Authorization: `Bearer ${token}` })
    .send({ fileName, fileSize: bytes.length });
  if (res.status !== 201) throw new Error(`template-upload → ${res.status} ${JSON.stringify(res.body)}`);
  const put = await fetch(res.body.uploadUrl as string, { method: 'PUT', body: new Uint8Array(bytes) });
  if (!put.ok) throw new Error(`PUT template → ${put.status}`);
  return res.body.templateId as string;
}
