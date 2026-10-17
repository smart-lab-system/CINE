import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GRADE_JOB_OPTIONS, GRADING_QUEUE } from '../src/grading/grading.queue';
import { ExamSessionEntity } from '../src/exam-session/entities/exam-session.entity';
import { GradingRunService } from '../src/grading/grading-run.service';
import { RegradeService } from '../src/grading/regrade.service';
import { forceStatus, seedResult, seedSession } from './helpers/grading-seed';

/**
 * G3 §2 D4 với Redis THẬT. Cách dựng một job `completed` mà không cần model: thêm job dưới `grade-<S>` với
 * payload trỏ tới một `submissionId` KHÔNG có dòng chấm — `gradeOneById` ghi cảnh báo rồi trả về, nên job hoàn
 * tất. Sau đó gọi service thật và kiểm job mới (payload đúng bài S) đã thay job ma. Hàng đợi được PAUSE trước để
 * worker thật không nhặt job mới và chấm một bài không có nội dung.
 */
describe('Chấm lại — job hoàn tất còn trong Redis thật (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let queue: Queue;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    queue = app.get<Queue>(getQueueToken(GRADING_QUEUE));
  }, 60_000);
  afterAll(async () => {
    await queue.resume();
    await app.close();
  });

  async function waitForState(jobId: string, wanted: string, ms = 15_000): Promise<void> {
    const deadline = Date.now() + ms;
    for (;;) {
      const job = await queue.getJob(jobId);
      if (job && (await job.getState()) === wanted) return;
      if (Date.now() > deadline) throw new Error(`job ${jobId} không tới trạng thái ${wanted}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  it('job completed cùng jobId bị thay bằng job mới của đúng bài', async () => {
    const ctx = await seedSession(ds, 'regrade-real');
    const made = await seedResult(ds, ctx, 'one_shot');
    await forceStatus(ds, made.resultId, 'flagged_for_review', {
      ungradable_class: 'system', ungradable_reason: 'Dịch vụ AI không phản hồi.', confidence: 0,
    });
    const jobId = `grade-${made.submissionId}`;

    // 1. Job ma: payload trỏ tới bài KHÔNG có dòng chấm → worker thật bỏ qua và job `completed`.
    await queue.add(
      'grade-submission',
      { resultId: randomUUID(), submissionId: randomUUID(), requiredFilename: 'x.docx', deliverableType: 'document', rubricId: randomUUID(), teacherId: ctx.teacherId },
      { ...GRADE_JOB_OPTIONS, jobId },
    );
    await waitForState(jobId, 'completed');

    // 2. Từ đây worker không nhặt gì nữa.
    await queue.pause();
    try {
      const outcome = await app.get(RegradeService).regradeOne(ctx.teacherId, made.resultId);
      expect(outcome).toEqual({ requeued: 1, skipped: [] });

      // 3. Không còn job ma: job dưới jobId này mang payload của ĐÚNG bài vừa chấm lại và chưa hoàn tất.
      const job = await queue.getJob(jobId);
      expect(job).toBeDefined();
      expect(job!.data.submissionId).toBe(made.submissionId);
      expect(await job!.getState()).not.toBe('completed');
      await job!.remove(); // dọn khi còn pause: worker không bao giờ chạy nó
    } finally {
      await queue.resume();
    }
  }, 60_000);

  // Review chung G1→G5 (G3 W1): nếu `enqueue` của chấm lại lỗi SAU khi dòng đã sang `ai_grading` (Redis chập chờn ở
  // `getJob`/`remove`), job `completed` CŨ vẫn nằm đó. `regradeStuck` là lưới cứu — nó không được bỏ qua job ấy:
  // dòng ở `ai_grading` mà job đã `completed` thì job đó là của lượt trước.
  it('regradeStuck: dòng ở ai_grading + job completed cũ cùng jobId -> xoá và xếp lại', async () => {
    const ctx = await seedSession(ds, 'stuck-real');
    const made = await seedResult(ds, ctx, 'one_shot'); // seedResult sinh dòng ở `ai_grading`
    const jobId = `grade-${made.submissionId}`;

    await queue.add(
      'grade-submission',
      { resultId: randomUUID(), submissionId: randomUUID(), requiredFilename: 'x.docx', deliverableType: 'document', rubricId: randomUUID(), teacherId: ctx.teacherId },
      { ...GRADE_JOB_OPTIONS, jobId },
    );
    await waitForState(jobId, 'completed');

    await queue.pause();
    try {
      const session = await ds.getRepository(ExamSessionEntity).findOneByOrFail({ id: ctx.sessionId });
      const outcome = await app.get(GradingRunService).regradeStuck(session, ctx.teacherId);
      expect(outcome).toEqual({ stuck: 1, requeued: 1 });

      const job = await queue.getJob(jobId);
      expect(job).toBeDefined();
      expect(job!.data.submissionId).toBe(made.submissionId);
      expect(await job!.getState()).not.toBe('completed');
      await job!.remove();
    } finally {
      await queue.resume();
    }
  }, 60_000);
});
