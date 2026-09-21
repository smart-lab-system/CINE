import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { AuditLogService } from '../src/admin/audit-log.service';
import { createTestAccount } from './helpers/create-account';

/**
 * `POST /exam-sessions/:id/bulk-review` — duyệt hàng loạt & can thiệp theo
 * tiêu chí (spec 2026-09-16-bulk-review-design.md rev 2).
 *
 * Bộ test này canh ba thứ mà không tầng nào khác canh được: lô là MỘT giao
 * dịch, bài không duyệt được thì bị BỎ QUA chứ không làm hỏng lô, và mỗi bài
 * đã công bố để lại đúng một dòng nhật ký (Security rule 4, không có ngoại lệ
 * cho thao tác hàng loạt).
 */
describe('Duyệt hàng loạt (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const stamp = Date.now();
  let token: string;
  let teacherId: string;
  let courseName: string;
  let classId: string;
  let roomName: string;
  let rubricId: string;
  /** Tiêu chí ĐẦU TIÊN của rubric fixture — dùng cho mọi luật `criterion_*`. */
  let criterionId: string;
  let criterionIds: string[];

  let dayCursor = 0;
  function freshWindow() {
    dayCursor += 1;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + dayCursor);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(10);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  let studentCursor = 0;

  /**
   * Một phiên với `n` bài đã ở `flagged_for_review`.
   *
   * AI cho `not_met` tiêu chí 1 và `partially_met` tiêu chí 2, nên MỌI luật
   * đều có chỗ để thay đổi — nếu AI đã cho sẵn điểm tối đa thì
   * `criterion_full_marks` trả `unchanged` và test đo nhầm thứ.
   */
  async function sessionWithGradedResults(
    n: number,
    opts: { advocate?: boolean; lastStillGrading?: boolean } = {},
  ): Promise<{ sessionId: string; resultIds: string[]; gradingId: string | null }> {
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Phiên bulk ${stamp}-${dayCursor}`,
        classId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        rubricId,
        requiredFilenames: ['Cau1.txt'],
        ...freshWindow(),
      });
    expect(created.status).toBe(201);

    const sessionId = created.body.id as string;
    const deliverableId = created.body.requiredDeliverables[0].id as string;
    const ids: string[] = [];
    let gradingId: string | null = null;

    for (let i = 0; i < n; i += 1) {
      studentCursor += 1;
      const mssv = `SVB${stamp}${studentCursor}`.slice(0, 20);
      await dataSource.query(
        `INSERT INTO examcollect.enrollment
           (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
        [mssv, `SV Bulk ${studentCursor}`, classId, teacherId],
      );

      const [submission] = await dataSource.query(
        `INSERT INTO examcollect.submission
           (exam_session_id, required_deliverable_id, student_mssv,
            student_name_input, home_class_id, home_teacher_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'received') RETURNING id`,
        [sessionId, deliverableId, mssv, `SV Bulk ${studentCursor}`, classId, teacherId],
      );
      // Trigger vòng đời chỉ nhận `received`/`invalid` lúc INSERT.
      await dataSource.query(`UPDATE examcollect.submission SET status = 'validated' WHERE id = $1`, [
        submission.id,
      ]);
      await dataSource.query(`UPDATE examcollect.submission SET status = 'collected' WHERE id = $1`, [
        submission.id,
      ]);

      const [result] = await dataSource.query(
        `INSERT INTO examcollect.grading_result
           (submission_id, rubric_id_version, grading_triggered_by, status)
         VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
        [submission.id, rubricId, teacherId],
      );
      ids.push(result.id);

      const isLast = i === n - 1;
      if (opts.lastStillGrading && isLast) {
        gradingId = result.id;
        continue;
      }

      const criterionResults = [
        { criterionId: criterionIds[0], verdict: 'not_met', points: 0, evidence: 'a' },
        { criterionId: criterionIds[1], verdict: 'partially_met', points: 1.5, evidence: 'b' },
      ];
      const advocate = opts.advocate
        ? {
            isCorrect: 'yes',
            reasoning: 'Em ấy mô tả đúng cơ chế bù trừ.',
            evidence: [],
            suggestedVerdicts: [
              { criterionId: criterionIds[0], suggestedVerdict: 'met', why: 'Đúng nguyên lý.' },
            ],
            unverifiedEvidence: [],
            usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
          }
        : null;

      // `ai_total_score` và mọi trường AI phải ghi trong CÙNG MỘT update:
      // `guard_grading_result_ai_immutable` đóng băng tất cả ngay khi
      // `ai_total_score` có giá trị.
      await dataSource.query(
        `UPDATE examcollect.grading_result
            SET status = 'ai_graded', ai_total_score = 1.5, confidence = 0.2,
                criterion_results = $2::jsonb, advocate_opinion = $3::jsonb
          WHERE id = $1`,
        [result.id, JSON.stringify(criterionResults), advocate && JSON.stringify(advocate)],
      );
      await dataSource.query(
        `UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`,
        [result.id],
      );
    }

    return { sessionId, resultIds: ids, gradingId };
  }

  /**
   * Như trên, nhưng mỗi bài đi tiếp tới `finalized`.
   *
   * Phải có một dòng `teacher_review` TRƯỚC khi chuyển sang `teacher_reviewed`,
   * nếu không `currentFinalScore` trả `null` và dòng audit nói `null → x`.
   */
  async function sessionWithFinalizedResults(
    n: number,
  ): Promise<{ sessionId: string; resultIds: string[] }> {
    const { sessionId, resultIds } = await sessionWithGradedResults(n);
    for (const id of resultIds) {
      await dataSource.query(
        `INSERT INTO examcollect.teacher_review
           (grading_result_id, teacher_id, final_score, edited_criteria)
         VALUES ($1, $2, '1.50', $3::jsonb)`,
        [
          id,
          teacherId,
          JSON.stringify([
            { criterionId: criterionIds[0], verdict: 'not_met', points: 0 },
            { criterionId: criterionIds[1], verdict: 'partially_met', points: 1.5 },
          ]),
        ],
      );
      await dataSource.query(
        `UPDATE examcollect.grading_result SET status = 'teacher_reviewed' WHERE id = $1`,
        [id],
      );
      await dataSource.query(
        `UPDATE examcollect.grading_result SET status = 'finalized' WHERE id = $1`,
        [id],
      );
    }
    return { sessionId, resultIds };
  }

  /** Gửi một lời gọi bulk-review đã gắn token. e2e xác thực bằng Bearer. */
  function bulk(sessionId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/bulk-review`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function reviewCount(resultIds: string[]): Promise<number> {
    const [row] = await dataSource.query(
      `SELECT count(*)::int AS n FROM examcollect.teacher_review
        WHERE grading_result_id = ANY($1::uuid[])`,
      [resultIds],
    );
    return row.n as number;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `bulk_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    token = login.body.accessToken as string;

    const course = { name: 'Môn duyệt hàng loạt' };
    courseName = course.name;
    const room = { name: `Phòng bulk ${stamp}` };
    roomName = room.name;
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Nhóm bulk ${stamp}`, teacherId],
    );
    classId = klass.id;

    const rubric = await request(app.getHttpServer())
      .post('/rubrics')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Rubric duyệt hàng loạt ${stamp}`,
        criteria: [
          { description: 'Mô tả cơ chế bù trừ', maxPoints: 4 },
          { description: 'Dẫn ví dụ cụ thể', maxPoints: 3 },
        ],
      });
    expect(rubric.status).toBe(201);
    rubricId = rubric.body.id;
    criterionIds = rubric.body.criteria.map((c: { id: string }) => c.id);
    criterionId = criterionIds[0];
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('N bài → N dòng teacher_review, trong MỘT giao dịch', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(3);

    const res = await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);

    expect(res.body.applied).toBe(3);
    expect(res.body.skipped).toEqual([]);
    expect(await reviewCount(resultIds)).toBe(3);
  });

  it('bài đang chấm bị BỎ QUA kèm lý do, lô vẫn chạy', async () => {
    const { sessionId, resultIds, gradingId } = await sessionWithGradedResults(3, {
      lastStillGrading: true,
    });

    const res = await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);

    expect(res.body.applied).toBe(2);
    expect(res.body.skipped).toEqual([{ resultId: gradingId, reason: 'not_reviewable' }]);
  });

  it('luật cần phản biện, bài không có → bỏ qua với lý do no_advocate', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(2);

    const res = await bulk(sessionId, { resultIds, rule: { kind: 'apply_advocate' } }).expect(200);

    expect(res.body.applied).toBe(0);
    expect(res.body.skipped.map((s: { reason: string }) => s.reason)).toEqual([
      'no_advocate',
      'no_advocate',
    ]);
    expect(await reviewCount(resultIds)).toBe(0);
  });

  it('id KHÔNG thuộc phiên → 400 và không ghi gì', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(2);
    const other = await sessionWithGradedResults(1);

    await bulk(sessionId, {
      resultIds: [...resultIds, other.resultIds[0]],
      rule: { kind: 'keep_ai' },
    }).expect(400);

    expect(await reviewCount(resultIds)).toBe(0);
  });

  it('id LẶP → 400 nói đúng nguyên nhân, không nói "không thuộc phiên"', async () => {
    // Không chặn ở DTO thì truy vấn trả về ít hàng hơn số id gửi lên, phép so
    // khớp số lượng ở service bắt được, và thông báo nói về một chuyện hoàn
    // toàn khác — người sửa lỗi đi tìm nhầm chỗ.
    const { sessionId, resultIds } = await sessionWithGradedResults(1);

    const res = await bulk(sessionId, {
      resultIds: [resultIds[0], resultIds[0]],
      rule: { kind: 'keep_ai' },
    }).expect(400);

    expect(JSON.stringify(res.body)).toMatch(/lặp/i);
    expect(await reviewCount(resultIds)).toBe(0);
  });

  it('tiêu chí không thuộc rubric của phiên → 400 và không ghi gì', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(2);

    await bulk(sessionId, {
      resultIds,
      rule: { kind: 'criterion_full_marks', criterionId: '00000000-0000-4000-8000-000000000000' },
    }).expect(400);

    expect(await reviewCount(resultIds)).toBe(0);
  });

  it('bài đã chốt → một dòng audit MỖI BÀI, và rule có trong newValue', async () => {
    const { sessionId, resultIds } = await sessionWithFinalizedResults(2);

    const res = await bulk(sessionId, {
      resultIds,
      rule: { kind: 'criterion_full_marks', criterionId },
    }).expect(200);

    expect(res.body.applied).toBe(2);
    expect(res.body.audited).toBe(2);

    const rows = await dataSource.query(
      `SELECT new_value FROM examcollect.audit_log
        WHERE action = 'grading_result.score_edited_after_finalize'
          AND target_id = ANY($1::uuid[])`,
      [resultIds],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].new_value.appliedRule).toEqual({
      kind: 'criterion_full_marks',
      criterionId,
    });
  });

  it('audit hỏng → CẢ LÔ rollback', async () => {
    const { sessionId, resultIds } = await sessionWithFinalizedResults(2);
    const spy = jest
      .spyOn(app.get(AuditLogService), 'recordUserAction')
      .mockRejectedValueOnce(new Error('sổ hỏng'));

    try {
      await bulk(sessionId, {
        resultIds,
        rule: { kind: 'criterion_full_marks', criterionId },
      }).expect(500);
    } finally {
      spy.mockRestore();
    }

    // Không có chế độ "áp được bao nhiêu hay bấy nhiêu": hai dòng có sẵn từ
    // fixture, và KHÔNG dòng nào được thêm.
    expect(await reviewCount(resultIds)).toBe(2);
  });

  it('bài đã teacher_reviewed vẫn sửa được lần hai', async () => {
    // `advance()` trả `false` ở đây vì `teacher_reviewed` không nằm trong tập
    // `from`. Đó là ĐÚNG, không phải lỗi — dòng duyệt mới nhất mới là điểm
    // hiện hành. Coi `false` là lỗi sẽ chặn giảng viên sửa lại bài họ vừa sửa.
    const { sessionId, resultIds } = await sessionWithGradedResults(1);
    await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);

    const second = await bulk(sessionId, {
      resultIds,
      rule: { kind: 'criterion_full_marks', criterionId },
    }).expect(200);
    expect(second.body.applied).toBe(1);

    const [row] = await dataSource.query(
      `SELECT status FROM examcollect.grading_result WHERE id = $1`,
      [resultIds[0]],
    );
    expect(row.status).toBe('teacher_reviewed');
  });

  it('bấm HAI LẦN → lần hai trả unchanged cho mọi bài, không ghi thêm dòng nào', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(3);
    await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);

    const second = await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);

    expect(second.body.applied).toBe(0);
    expect(second.body.skipped).toHaveLength(3);
    expect(second.body.skipped.every((s: { reason: string }) => s.reason === 'unchanged')).toBe(
      true,
    );
    expect(await reviewCount(resultIds)).toBe(3);
  });

  it('cùng điểm nhưng ghi chú MỚI → VẪN ghi dòng mới', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(1);
    await bulk(sessionId, { resultIds, rule: { kind: 'keep_ai' } }).expect(200);

    const second = await bulk(sessionId, {
      resultIds,
      rule: { kind: 'keep_ai' },
      privateNote: 'đề câu 3 in mờ',
    }).expect(200);

    expect(second.body.applied).toBe(1);
    expect(await reviewCount(resultIds)).toBe(2);
  });

  it('applied_rule có mặt kể cả khi bài CHƯA công bố', async () => {
    // Đây là ca mà audit KHÔNG bắn — và là lỗ mà cột này sinh ra để bịt.
    const { sessionId, resultIds } = await sessionWithGradedResults(1, { advocate: true });

    await bulk(sessionId, { resultIds, rule: { kind: 'apply_advocate' } }).expect(200);

    const [row] = await dataSource.query(
      `SELECT applied_rule FROM examcollect.teacher_review
        WHERE grading_result_id = $1 ORDER BY reviewed_at DESC LIMIT 1`,
      [resultIds[0]],
    );
    expect(row.applied_rule).toEqual({ kind: 'apply_advocate' });
  });

  it('áp kiến nghị phản biện KHÔNG làm tụt điểm', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(2, { advocate: true });

    const res = await bulk(sessionId, { resultIds, rule: { kind: 'apply_advocate' } }).expect(200);

    expect(res.body.applied).toBe(2);
    const rows = await dataSource.query(
      `SELECT final_score FROM examcollect.teacher_review
        WHERE grading_result_id = ANY($1::uuid[])`,
      [resultIds],
    );
    // AI: 0 + 1.5 = 1.5. Phản biện nâng tiêu chí 1 lên met (4) ⇒ 5.5.
    expect(rows.every((r: { final_score: string }) => Number(r.final_score) === 5.5)).toBe(true);
  });

  it('ghi chú nhân bản vào TỪNG dòng', async () => {
    const { sessionId, resultIds } = await sessionWithGradedResults(3);

    await bulk(sessionId, {
      resultIds,
      rule: { kind: 'keep_ai' },
      privateNote: 'đề câu 3 in mờ',
    }).expect(200);

    const rows = await dataSource.query(
      `SELECT private_note FROM examcollect.teacher_review
        WHERE grading_result_id = ANY($1::uuid[])`,
      [resultIds],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r: { private_note: string }) => r.private_note === 'đề câu 3 in mờ')).toBe(
      true,
    );
  });

  it('BẤT BIẾN: mọi grading_result trong một phiên có cùng rubric_id_version', async () => {
    // Bất biến này đang ĐỠ một lối tắt: `criterionId` được kiểm một lần cho
    // cả phiên thay vì từng bài. Vỡ thì `criterion_full_marks` áp nhầm tiêu
    // chí trên những bài dùng rubric khác — sai ÂM THẦM, không lỗi, không log.
    const { sessionId } = await sessionWithGradedResults(3);

    const [row] = await dataSource.query(
      `SELECT count(DISTINCT g.rubric_id_version)::int AS versions
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
        WHERE s.exam_session_id = $1`,
      [sessionId],
    );
    expect(row.versions).toBe(1);
  });
});
