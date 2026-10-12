import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradeExportDataService } from '../src/grade-export/grade-export.data';
import { loadCurrentScore } from '../src/grading/scoring/score-inputs';
import { seedGradebookWorld, type GradebookWorld } from './helpers/grade-export-seed';

describe('Nạp sinh viên và điểm của phiên để ghi vào sổ điểm (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let data: GradeExportDataService;
  let w: GradebookWorld;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    data = app.get(GradeExportDataService);
    w = await seedGradebookWorld(app, 'data');
  }, 90_000);
  afterAll(async () => app.close());

  const outcomes = async (deliverableId: string | null = null) => {
    const { students, publishedResults } = await data.loadStudents(ds.manager, w.ctx.sessionId, deliverableId);
    return { byMssv: new Map(students.map((s) => [s.mssv.toLowerCase(), s.outcome])), publishedResults, total: students.length };
  };

  it('điểm của bài đã chốt: đúng nguồn, đúng số nguyên phần trăm, đúng lượt tính nguồn', async () => {
    const { byMssv, publishedResults } = await outcomes();
    const [g] = await ds.query(`SELECT finalized_computation_id FROM examcollect.grading_result WHERE id = $1`, [w.auto.resultId]);
    expect(byMssv.get(w.auto.mssv.toLowerCase())).toEqual({ kind: 'scored', hundredths: 850, computationId: g.finalized_computation_id, source: 'finalized' });
    expect(byMssv.get(w.reviewed.mssv.toLowerCase())).toEqual({ kind: 'scored', hundredths: 650, computationId: null, source: 'review' });
    expect(byMssv.get(w.manual.mssv.toLowerCase())).toEqual({ kind: 'scored', hundredths: 525, computationId: null, source: 'manual' });
    expect(publishedResults).toBe(3);
  });

  // Review Focus 2: cùng điểm với `loadCurrentScore` cho từng bài — hai câu SQL, một sự thật.
  it('khớp `loadCurrentScore` từng bài đã chốt', async () => {
    const { byMssv } = await outcomes();
    for (const s of [w.auto, w.reviewed, w.manual]) {
      const outcome = byMssv.get(s.mssv.toLowerCase());
      const current = await loadCurrentScore(ds.manager, s.resultId!);
      expect(outcome).toMatchObject({ kind: 'scored' });
      expect((outcome as { hundredths: number }).hundredths).toBe(Math.round(current.value! * 100));
    }
  });

  // Review Focus 4: bài đã có điểm tạm nhưng chưa chốt KHÔNG bao giờ ra ngoài.
  it('bài mới sau chốt là ô trống có lý do — kể cả bài đã có điểm tạm 9,00', async () => {
    const { byMssv } = await outcomes();
    const [g] = await ds.query(`SELECT status FROM examcollect.grading_result WHERE id = $1`, [w.notFinal.resultId]);
    expect(g.status).toBe('teacher_reviewed');
    expect(byMssv.get(w.notFinal.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'not_finished' });
    expect(byMssv.get(w.late.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'not_finished' });
    expect(byMssv.get(w.ungradable.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'ungradable' });
    expect(byMssv.get(w.flagged.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'flagged' });
    expect(byMssv.get(w.noResult.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'not_finished' });
    expect(byMssv.get(w.absent.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'absent' });
  });

  it('mỗi sinh viên đúng một lần: danh sách phiên hợp với người đã nộp, tên ưu tiên danh sách phiên', async () => {
    const { total } = await outcomes();
    expect(total).toBe(9);
    const { students } = await data.loadStudents(ds.manager, w.ctx.sessionId, null);
    expect(students.find((s) => s.mssv === w.absent.mssv)?.name).toBe('Sinh viên vắng');
  });

  it('lọc theo yêu cầu nộp: một yêu cầu không có bài nào cho ra toàn bộ sinh viên trong danh sách phiên là vắng', async () => {
    const { byMssv, publishedResults } = await outcomes(randomUUID());
    expect([...byMssv.values()]).toEqual([{ kind: 'blank', reason: 'absent' }]);
    expect(publishedResults).toBe(0);
  });

  it('deliverables: liệt kê yêu cầu nộp của phiên', async () => {
    expect(await data.deliverables(ds.manager, w.ctx.sessionId)).toEqual([{ id: w.ctx.deliverableId, requiredFilename: 'Cau1.docx' }]);
  });

  describe('previousWrites — giá trị đã ghi cuối cùng, theo phiên và theo yêu cầu nộp', () => {
    async function exportWith(deliverableId: string | null, at: string, rows: [string, number | null][]): Promise<string> {
      const [e] = await ds.query(
        `INSERT INTO examcollect.grade_export (exam_session_id, exported_by, template_storage_key, mssv_column, score_column, required_deliverable_id, exported_at)
         VALUES ($1, $2, 'k', 'B', 'F', $3, $4) RETURNING id`,
        [w.ctx.sessionId, w.ctx.teacherId, deliverableId, at],
      );
      for (const [i, [mssv, written]] of rows.entries()) {
        await ds.query(
          `INSERT INTO examcollect.grade_export_row (grade_export_id, file_row, mssv, written_hundredths, blank_reason) VALUES ($1, $2, $3, $4, $5)`,
          [e.id, 5 + i, mssv, written, written === null ? 'absent' : null],
        );
      }
      return e.id as string;
    }

    it('lượt mới nhất thắng; dòng trống không tính; MSSV không phân biệt hoa/thường; tách theo yêu cầu nộp', async () => {
      const a = w.auto.mssv.toUpperCase();
      await exportWith(null, '2026-09-29T08:00:00Z', [[a, 800], [w.reviewed.mssv, 600]]);
      const second = await exportWith(null, '2026-09-29T09:00:00Z', [[w.auto.mssv.toLowerCase(), 850], [w.absent.mssv, null]]);
      await exportWith(w.ctx.deliverableId, '2026-09-29T10:00:00Z', [[w.auto.mssv, 999]]);

      const prev = await data.previousWrites(ds.manager, w.ctx.sessionId, null);
      expect(prev.get(w.auto.mssv.toLowerCase())).toEqual({ hundredths: 850, computationId: null, step: 1 });
      expect(prev.get(w.reviewed.mssv.toLowerCase())).toEqual({ hundredths: 600, computationId: null, step: 1 });
      expect(prev.has(w.absent.mssv.toLowerCase())).toBe(false);
      expect(prev.size).toBe(2);

      const scoped = await data.previousWrites(ds.manager, w.ctx.sessionId, w.ctx.deliverableId);
      expect([...scoped]).toEqual([[w.auto.mssv.toLowerCase(), { hundredths: 999, computationId: null, step: 1 }]]);

      expect(await data.previousExportCount(ds.manager, w.ctx.sessionId, null)).toBe(2);
      expect(await data.previousExportCount(ds.manager, w.ctx.sessionId, w.ctx.deliverableId)).toBe(1);
      expect(second).toBeTruthy();
    });
  });

  it('computations và ruleNames: điểm thô, breakdown, tên bản sửa luật', async () => {
    const [g] = await ds.query(`SELECT finalized_computation_id FROM examcollect.grading_result WHERE id = $1`, [w.auto.resultId]);
    const map = await data.computations(ds.manager, [g.finalized_computation_id]);
    const got = map.get(g.finalized_computation_id)!;
    expect(got.raw).toBe(850);
    expect(got.breakdown.errors.map((e) => e.ruleKey)).toEqual(['sai_bien']);
    const names = await data.ruleNames(ds.manager, [w.bien.revisionId]);
    expect(names.get(w.bien.revisionId)).toBe('sai_bien');
    expect((await data.computations(ds.manager, [])).size).toBe(0);
    expect((await data.ruleNames(ds.manager, [])).size).toBe(0);
  });
});
