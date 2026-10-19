import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradingResultEntity } from '../src/grading/entities/grading-result.entity';
import { GradingService } from '../src/grading/grading.service';
import { GradeSubmissionJob } from '../src/grading/grading.queue';
import { GradeExportDataService } from '../src/grade-export/grade-export.data';
import { PriceService } from '../src/grading/rules/price.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { scoreResult, seedResult, seedSession, SeedSession } from './helpers/grading-seed';
import {
  assignmentId,
  rubricNameOf,
  seedInvestigatorResult,
  seedInvestigatorSession,
  seedPrices,
  seedRule,
  storedWith,
} from './helpers/investigator-seed';

/**
 * P1a — các bẫy §9 của spec, chốt bằng dữ liệu được seed ĐÚNG HÌNH DẠNG của P1a (unique(submission_id) còn).
 * Bẫy 1 chỉ lộ ra khi P2 bỏ unique: test này khoá hành vi trước, để P2 khỏi phải đoán.
 */
describe('P1a — bẫy §9 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let grading: GradingService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    grading = app.get(GradingService);
  });
  afterAll(async () => app.close());

  describe('bẫy 1 — gradeOneById tra kết quả theo resultId', () => {
    it('job mang resultId: dòng chấm được tra theo id của kết quả, không theo submissionId', async () => {
      const ctx = await seedSession(ds, 'trap-1');
      const { resultId, submissionId } = await seedResult(ds, ctx);
      // Đã có điểm → gradeOneById thoát ngay sau khi tra dòng, không chạy pipeline.
      await scoreResult(ds, resultId);
      const repo = app.get<Repository<GradingResultEntity>>(getRepositoryToken(GradingResultEntity));
      const spy = jest.spyOn(repo, 'findOne');

      const job: GradeSubmissionJob = {
        resultId,
        submissionId,
        deliverableType: 'document',
        requiredFilename: 'bai.docx',
        rubricId: ctx.rubricId,
        teacherId: ctx.teacherId,
      };
      await grading.gradeOneById(job);

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ where: { id: resultId } }));
      spy.mockRestore();
    });
  });

    it('job cũ (xếp trước lần triển khai, không có resultId) vẫn tra theo bài nộp, không tra theo id rỗng', async () => {
      const ctx = await seedSession(ds, 'trap-1-legacy');
      const { resultId, submissionId } = await seedResult(ds, ctx);
      await scoreResult(ds, resultId);
      const repo = app.get<Repository<GradingResultEntity>>(getRepositoryToken(GradingResultEntity));
      const spy = jest.spyOn(repo, 'findOne');

      // Hình dạng job của mã cũ: không có resultId. Tra theo `{ id: undefined }` sẽ bị TypeORM bỏ điều kiện
      // và trả dòng bất kỳ của bảng.
      const legacy = {
        submissionId,
        deliverableType: 'document',
        requiredFilename: 'bai.docx',
        rubricId: ctx.rubricId,
        teacherId: ctx.teacherId,
      } as GradeSubmissionJob;
      await grading.gradeOneById(legacy);

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ where: { submissionId } }));
      spy.mockRestore();
    });

  describe('bẫy 3 — gộp sổ điểm theo sinh viên không ghi đè', () => {
    it('một sinh viên có hai kết quả ở hai yêu cầu nộp → conflict, không lấy kết quả cuối', async () => {
      const ctx = await seedSession(ds, 'trap-3');
      const first = await seedResult(ds, ctx);
      await scoreResult(ds, first.resultId, '7.00');
      const [{ student_mssv: mssv }] = await ds.query(
        `SELECT student_mssv FROM examcollect.submission WHERE id = $1`,
        [first.submissionId],
      );
      // Yêu cầu nộp thứ hai của cùng sinh viên: uq_submission_identity cho phép vì khác deliverable.
      const [d2] = await ds.query(
        `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type, language)
         VALUES ($1, 'Cau2.docx', 'document', NULL) RETURNING id`,
        [ctx.sessionId],
      );
      const [sub2] = await ds.query(
        `INSERT INTO examcollect.submission
           (exam_session_id, required_deliverable_id, student_mssv, student_name_input, home_class_id, home_teacher_id, status)
         VALUES ($1, $2, $3, 'Sinh viên seed', $4, $5, 'received') RETURNING id`,
        [ctx.sessionId, d2.id, mssv, ctx.classId, ctx.teacherId],
      );
      for (const next of ['validated', 'collected']) {
        await ds.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [next, sub2.id]);
      }
      const [res2] = await ds.query(
        `INSERT INTO examcollect.grading_result (submission_id, rubric_id_version, grading_triggered_by, status, pipeline)
         VALUES ($1, $2, $3, 'ai_grading', 'one_shot') RETURNING id`,
        [sub2.id, ctx.rubricId, ctx.teacherId],
      );
      await scoreResult(ds, res2.id, '9.00');

      const { students } = await app.get(GradeExportDataService).loadStudents(ds.manager, ctx.sessionId, null);

      const mine = students.filter((s) => s.mssv.toLowerCase() === mssv.toLowerCase());
      expect(mine).toHaveLength(1);
      expect(mine[0].outcome).toEqual({ kind: 'conflict', reason: expect.stringMatching(/nhiều kết quả/) });
    });
  });

  describe('planReapply — giá theo rubric của chính kết quả', () => {
    it('phiên có hai kết quả thuộc hai rubric: đổi giá rubric B chỉ tính lại bài của B, không bỏ qua vì thiếu giá', async () => {
      const a = await seedSession(ds, 'trap-8-a');
      await seedInvestigatorSession(ds, a);
      const b = await seedSession(ds, 'trap-8-b', { teacherId: a.teacherId, startHoursAgo: 10 });
      await seedInvestigatorSession(ds, b);
      const teacherId = a.teacherId;
      const nameB = await rubricNameOf(ds, b.rubricId);
      const chung = await seedRule(ds, teacherId, 'chung', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
      const ten = await seedRule(ds, teacherId, 'ten_bien', 'trinh_bay');
      await seedPrices(ds, teacherId, { [chung.ruleId]: '1.00', [ten.ruleId]: '0.50' });
      const chungB = await assignmentId(ds, teacherId, nameB, chung.ruleId);
      const seen = [
        { ruleKey: 'chung', checkedBy: 'machine' as const },
        { ruleKey: 'ten_bien', checkedBy: 'model' as const },
      ];

      // Bài A theo rubric của phiên; bài B cùng phiên nhưng ghim rubric B (rubric_id_version).
      const ra = await seedInvestigatorResult(ds, a, storedWith(seen));
      await app.get(ScoreService).computeInitial(ra.resultId);
      const rb = await seedInvestigatorResult(ds, a, storedWith(seen));
      await ds.query(`UPDATE examcollect.grading_result SET rubric_id_version = $2 WHERE id = $1`, [rb.resultId, b.rubricId]);
      await app.get(ScoreService).computeInitial(rb.resultId);
      await app.get(TeacherReviewService).finalizeGrades(a.sessionId, teacherId);

      await app.get(PriceService).setPrice(teacherId, chungB, '3.00', teacherId);
      const plan = await app.get(ScoreService).previewReapply(a.sessionId, teacherId);

      expect(plan.skipped).toEqual([]);
      expect(plan.changes.map((c) => c.resultId)).toEqual([rb.resultId]);
    });
  });
});
