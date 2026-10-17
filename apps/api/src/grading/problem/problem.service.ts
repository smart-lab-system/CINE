import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { lockTeacherScoring } from '../scoring/teacher-lock';
import { ensureDefaultProblem } from './resolve-problem-config';

/**
 * Câu như Soạn đề sinh ra, chỉ phần đường tạo câu cần. Kiểu cấu trúc, không import từ `exam-authoring`:
 * `exam-authoring` đã import `grading`, chiều ngược lại sẽ thành vòng.
 */
export interface AuthoredQuestion {
  statement: string;
  points: number;
}

/** Ngữ cảnh mà đề nhiều câu cần để kiểm D1 (rubric) và D2 (ngôn ngữ), đọc dưới khoá giảng viên. */
export interface AuthoringContext {
  rubricId: string | null;
  /** Tổng tiêu chí của rubric phiên, đơn vị phần trăm điểm; 0 khi chưa có rubric. */
  rubricTotalHundredths: number;
  /** Ngôn ngữ khai trong các yêu cầu nộp của phiên, đã khử trùng. */
  languages: string[];
}

export interface AuthoredProblemPlan {
  ordinal: number;
  title: string;
  pointsHundredths: number;
  statement: string;
}

/**
 * Đọc ngữ cảnh của phiên cho đề nhiều câu. Gọi trước mọi lệnh ghi để một đề sai bị từ chối mà chưa đụng gì
 * (xem `attach`), và gọi lại dưới khoá trong `createProblemsFromAuthoring` để không đọc số cũ.
 */
export async function authoringContextOf(m: EntityManager, sessionId: string): Promise<AuthoringContext> {
  const [session] = await m.query(`SELECT rubric_id FROM examcollect.exam_session WHERE id = $1`, [sessionId]);
  if (!session) {
    throw new NotFoundException('Không tìm thấy phiên thi.');
  }
  const rubricId = (session.rubric_id as string | null) ?? null;
  const [total] = await m.query(
    `SELECT COALESCE(ROUND(SUM(max_points) * 100)::int, 0) AS total
       FROM examcollect.rubric_criterion WHERE rubric_id = $1`,
    [rubricId],
  );
  const langs: { language: string }[] = await m.query(
    `SELECT DISTINCT language::text AS language
       FROM examcollect.required_deliverable
      WHERE exam_session_id = $1 AND language IS NOT NULL`,
    [sessionId],
  );
  return {
    rubricId,
    rubricTotalHundredths: rubricId === null ? 0 : Number(total.total),
    languages: langs.map((r) => r.language),
  };
}

/** Điểm câu sang phần trăm điểm, và từ chối điểm không dương hoặc có hơn hai chữ số thập phân. */
function toHundredths(points: number, ordinal: number): number {
  if (!Number.isFinite(points) || points <= 0) {
    throw new BadRequestException(`Câu ${ordinal}: điểm phải là số dương.`);
  }
  const scaled = points * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new BadRequestException(`Câu ${ordinal}: điểm ${points} có quá hai chữ số thập phân.`);
  }
  return rounded;
}

/**
 * Kiểm đề nhiều câu theo D1 và D2 (đã duyệt, plan P1b), và trả kế hoạch tạo câu. Hàm thuần: không chạm DB.
 *
 * D1: mọi câu dùng chung rubric của phiên, và điểm mỗi câu PHẢI bằng tổng tiêu chí của rubric đó
 * (đúng bất biến "tổng tiêu chí = points_hundredths"). D2: ngôn ngữ phải khai đúng một giá trị trong
 * các yêu cầu nộp của phiên; đề soạn ra không có trường ngôn ngữ theo câu.
 */
export function planAuthoredProblems(questions: AuthoredQuestion[], ctx: AuthoringContext): AuthoredProblemPlan[] {
  const plans = questions.map((q, i) => {
    const ordinal = i + 1;
    const pointsHundredths = toHundredths(q.points, ordinal);
    if (ctx.rubricId === null) {
      throw new BadRequestException(
        'Phiên chưa gắn rubric: đề nhiều câu cần một rubric có tổng tiêu chí bằng điểm từng câu.',
      );
    }
    if (pointsHundredths !== ctx.rubricTotalHundredths) {
      throw new BadRequestException(
        `Câu ${ordinal} có ${q.points} điểm, khác tổng tiêu chí của rubric phiên (${ctx.rubricTotalHundredths / 100}). ` +
          'Đề nhiều câu dùng chung một rubric: điểm mỗi câu phải bằng tổng tiêu chí.',
      );
    }
    return { ordinal, title: `Câu ${ordinal}`, pointsHundredths, statement: q.statement };
  });

  if (ctx.languages.length !== 1) {
    const shown = ctx.languages.length === 0 ? 'chưa khai' : ctx.languages.join(', ');
    throw new BadRequestException(
      `Đề nhiều câu cần khai đúng một ngôn ngữ trong yêu cầu nộp của phiên (hiện: ${shown}).`,
    );
  }
  return plans;
}

/**
 * Tạo các câu của đề nhiều câu: câu 1 là câu mặc định đã có (cập nhật tại chỗ), câu 2 trở đi là dòng mới.
 *
 * Gọi trong transaction của người gọi. Khoá giảng viên TRƯỚC, hàng phiên SAU, như mọi đường ghi khác. Từ chối
 * 409 nếu phiên đã có câu thứ hai: đây là đường gắn đề lần đầu, không gắn lại đè lên đề nhiều câu.
 */
export async function createProblemsFromAuthoring(
  m: EntityManager,
  sessionId: string,
  questions: AuthoredQuestion[],
): Promise<{ problemId: string; ordinal: number }[]> {
  const [owner] = await m.query(`SELECT teacher_id FROM examcollect.exam_session WHERE id = $1`, [sessionId]);
  if (!owner) {
    throw new NotFoundException('Không tìm thấy phiên thi.');
  }
  await lockTeacherScoring(m, owner.teacher_id as string);
  await m.query(`SELECT id FROM examcollect.exam_session WHERE id = $1 FOR UPDATE`, [sessionId]);

  const [later] = await m.query(
    `SELECT COUNT(*)::int AS n FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal > 1`,
    [sessionId],
  );
  if ((later.n as number) > 0) {
    throw new ConflictException('phiên đã có nhiều câu — không gắn lại đề nhiều câu.');
  }

  const ctx = await authoringContextOf(m, sessionId);
  const plans = planAuthoredProblems(questions, ctx);
  const language = ctx.languages[0];
  const firstId = await ensureDefaultProblem(m, sessionId);

  const out: { problemId: string; ordinal: number }[] = [];
  for (const plan of plans) {
    if (plan.ordinal === 1) {
      await m.query(
        `UPDATE examcollect.exam_problem
            SET title = $2, points_hundredths = $3, statement = $4, rubric_id = $5, language = $6
          WHERE id = $1`,
        [firstId, plan.title, plan.pointsHundredths, plan.statement, ctx.rubricId, language],
      );
      out.push({ problemId: firstId, ordinal: 1 });
      continue;
    }
    const [row] = await m.query(
      `INSERT INTO examcollect.exam_problem
         (exam_session_id, ordinal, title, points_hundredths, statement, statement_quote, rubric_id, language)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7) RETURNING id`,
      [sessionId, plan.ordinal, plan.title, plan.pointsHundredths, plan.statement, ctx.rubricId, language],
    );
    out.push({ problemId: row.id as string, ordinal: plan.ordinal });
  }
  return out;
}
