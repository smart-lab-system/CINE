import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradingResultEntity } from '../src/grading/entities/grading-result.entity';
import { GradingService } from '../src/grading/grading.service';
import { GradeSubmissionJob } from '../src/grading/grading.queue';
import { scoreResult, seedResult, seedSession } from './helpers/grading-seed';

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
});
