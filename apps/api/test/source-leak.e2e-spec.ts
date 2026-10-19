import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ExamSessionEntity } from '../src/exam-session/entities/exam-session.entity';
import { ExamMaterialService } from '../src/exam-session/exam-material.service';
import { InvestigationContextService } from '../src/grading/pipeline/investigation-context.service';
import { StorageService } from '../src/storage/storage.service';
import { CodeSession, putObject, seedCodeSession, seedCodeSubmission } from './helpers/code-session-seed';

/**
 * G2b-R Task 3 — mã nguồn đáp án mẫu (spec G2b §4.9). Nó nằm trên kho theo khoá băm ở prefix `grading-reference/` và hai
 * thứ ĐƯỢC PHÉP thấy nó là giảng viên chủ phiên và worker chạy đáp án. Hai nơi KHÔNG ĐƯỢC thấy, test này khoá:
 * - `listForAgent`: phát cho agent coi thi ngay khi qua `start_time`, kèm URL tải của MỌI dòng `exam_material`;
 * - ngữ cảnh của agent điều tra: không gian làm việc của nó chỉ nhận đề chữ, bài nộp, gói test và bảng lỗi.
 *
 * Mã nguồn được đặt bằng đúng các cột và khoá mà đường sinh và đường tải mã ghi (A2b); cái cần chứng minh là hai nơi đọc kia
 * không chạm tới chúng, không phải đường ghi.
 */
describe('mã nguồn đáp án không lộ ra ngoài vùng của giảng viên (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storage: StorageService;
  const MARKER = 'BI_MAT_MA_NGUON_DAP_AN_7f3a91';
  const CODE = `#include <iostream>\n// ${MARKER}\nint main() { std::cout << 42; }\n`;
  const SHA = createHash('sha256').update(CODE, 'utf8').digest('hex');

  /** Phiên code đủ đồ (đề chữ, gói test ghim) cộng một mã đáp án ở cột nguồn. */
  async function seedWithSource(label: string): Promise<CodeSession> {
    const session = await seedCodeSession(ds, storage, label);
    const key = `grading-reference/${session.ctx.sessionId}/source-${SHA}.cpp`;
    await putObject(storage, key, CODE);
    await ds.query(
      `UPDATE examcollect.grading_reference
          SET model_answer_source_key = $2, model_answer_source_sha256 = $3, model_answer_origin = 'generated',
              model_answer_unverified = true, ruler_trust = 'unverified'
        WHERE exam_session_id = $1`,
      [session.ctx.sessionId, key, SHA],
    );
    return session;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    storage = app.get(StorageService);
  });
  afterAll(async () => app.close());

  it('listForAgent sau start_time không trả mã nguồn, khoá hay băm của nó', async () => {
    const session = await seedWithSource('leak-agent');
    const entity = await ds.getRepository(ExamSessionEntity).findOneByOrFail({ id: session.ctx.sessionId });

    const view = await app.get(ExamMaterialService).listForAgent(entity, new Date());

    // Phải đang ở trạng thái ĐÃ PHÁT: nếu còn khoá thì "không thấy" chẳng chứng minh gì.
    expect(view.released).toBe(true);
    const blob = JSON.stringify(view);
    expect(blob).not.toContain(MARKER);
    expect(blob).not.toContain('grading-reference/');
    expect(blob).not.toContain(SHA);
  });

  it('không dòng exam_material nào trỏ vào prefix grading-reference/', async () => {
    const session = await seedWithSource('leak-material');

    const rows = await ds.query(`SELECT storage_key FROM examcollect.exam_material WHERE exam_session_id = $1`, [session.ctx.sessionId]);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: { storage_key: string }) => !r.storage_key.startsWith('grading-reference/'))).toBe(true);
  });

  it('ngữ cảnh của agent điều tra không chứa mã nguồn, khoá hay băm của đáp án', async () => {
    const session = await seedWithSource('leak-investigator');
    const { resultId } = await seedCodeSubmission(ds, storage, session);

    const built = await app.get(InvestigationContextService).build(resultId);

    // Dựng được ngữ cảnh đầy đủ (không phải `ungradable`), nếu không thì "không chứa" là điều hiển nhiên.
    expect(built.kind).toBe('ok');
    if (built.kind !== 'ok') throw new Error('unreachable');
    const blob = JSON.stringify(built.ctx);
    expect(blob).not.toContain(MARKER);
    expect(blob).not.toContain('grading-reference/');
    expect(blob).not.toContain(SHA);
    // Và nó vẫn có đủ thứ nó được phép thấy.
    expect(built.ctx.problemStatement).toContain('Viết hàm tính tổng');
    expect(built.ctx.testBundle.cases.length).toBeGreaterThan(0);
  });
});
