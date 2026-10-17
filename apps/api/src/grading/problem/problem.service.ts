import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { lockTeacherScoring } from '../scoring/teacher-lock';
import { AddProblemDto } from './problem.dto';
import { cloneRubricForQuestion } from './question-rubric';
import { loadStudentBoard, StudentBoardRow } from './student-total.query';
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
  /** Yêu cầu nộp đã khai của phiên, theo thứ tự tên file. Rỗng khi phiên chưa khai yêu cầu nộp nào. */
  deliverables: { id: string; filename: string }[];
}

export interface AuthoredProblemPlan {
  ordinal: number;
  title: string;
  pointsHundredths: number;
  statement: string;
  /** Ngôn ngữ của câu: từ yêu cầu nộp đã khai, hoặc từ đề nếu phiên chưa khai yêu cầu nộp nào. */
  language: string;
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
  const rows: { id: string; required_filename: string; language: string | null }[] = await m.query(
    `SELECT id, required_filename, language::text AS language
       FROM examcollect.required_deliverable WHERE exam_session_id = $1`,
    [sessionId],
  );
  // 5.2: ghép câu với yêu cầu nộp theo thứ tự tên file (không có cột thời gian tạo); tên có số được sắp theo số.
  const deliverables = [...rows].sort((a, b) =>
    a.required_filename.localeCompare(b.required_filename, undefined, { numeric: true }),
  );
  return {
    rubricId,
    rubricTotalHundredths: rubricId === null ? 0 : Number(total.total),
    languages: [...new Set(deliverables.map((d) => d.language).filter((l): l is string => l !== null))],
    deliverables: deliverables.map((d) => ({ id: d.id, filename: d.required_filename })),
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
 * Kiểm đề nhiều câu trước khi ghi và trả kế hoạch tạo câu. Hàm thuần: không chạm DB.
 *
 * Điểm mỗi câu phải là số nguyên phần trăm (tối đa hai chữ số thập phân). Rubric riêng của từng câu được sinh
 * sau từ rubric mẫu của phiên (5.1), nên không còn ràng buộc "điểm câu = tổng rubric mẫu" (đã bỏ D1).
 * Ngôn ngữ phải khai đúng một giá trị trong các yêu cầu nộp của phiên (D2).
 */
export function planAuthoredProblems(
  questions: AuthoredQuestion[],
  ctx: AuthoringContext,
  examLanguage: string,
): AuthoredProblemPlan[] {
  const plans = questions.map((q, i) => {
    const ordinal = i + 1;
    const pointsHundredths = toHundredths(q.points, ordinal);
    if (ctx.rubricId === null) {
      throw new BadRequestException('Phiên chưa gắn rubric mẫu: đề nhiều câu cần một rubric để tách tiêu chí cho từng câu.');
    }
    // Kiểm ở đây (trước mọi lệnh ghi), không để `cloneRubricForQuestion` ném giữa transaction khi đã ghi đề và tham chiếu.
    if (ctx.rubricTotalHundredths <= 0) {
      throw new BadRequestException('Rubric mẫu của phiên chưa có tiêu chí có điểm để tách cho từng câu.');
    }
    return { ordinal, title: `Câu ${ordinal}`, pointsHundredths, statement: q.statement };
  });

  // 5.2: đã khai yêu cầu nộp thì số lượng phải bằng số câu (ghép từng câu với một file) và ngôn ngữ phải thống nhất.
  if (ctx.deliverables.length > 0) {
    if (ctx.deliverables.length !== questions.length) {
      throw new BadRequestException(
        `Phiên đã khai ${ctx.deliverables.length} yêu cầu nộp nhưng đề có ${questions.length} câu — số phải bằng nhau để ghép từng câu với một file.`,
      );
    }
    if (ctx.languages.length !== 1) {
      const shown = ctx.languages.length === 0 ? 'chưa khai' : ctx.languages.join(', ');
      throw new BadRequestException(
        `Đề nhiều câu cần khai đúng một ngôn ngữ trong yêu cầu nộp của phiên (hiện: ${shown}).`,
      );
    }
    return plans.map((p) => ({ ...p, language: ctx.languages[0] }));
  }
  // Chưa khai yêu cầu nộp nào: mỗi câu sẽ có một yêu cầu nộp mới, ngôn ngữ lấy từ đề.
  if (examLanguage !== 'cpp' && examLanguage !== 'python') {
    throw new BadRequestException(`Đề nhiều câu cần ngôn ngữ cpp hoặc python, đề hiện khai "${examLanguage}".`);
  }
  return plans.map((p) => ({ ...p, language: examLanguage }));
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
  examLanguage: string,
): Promise<{ problemId: string; ordinal: number }[]> {
  const teacherId = await lockSessionForWrite(m, sessionId);
  const [sessionRow] = await m.query(`SELECT code FROM examcollect.exam_session WHERE id = $1`, [sessionId]);

  const [later] = await m.query(
    `SELECT COUNT(*)::int AS n FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal > 1`,
    [sessionId],
  );
  if ((later.n as number) > 0) {
    throw new ConflictException('phiên đã có nhiều câu — không gắn lại đề nhiều câu.');
  }

  const ctx = await authoringContextOf(m, sessionId);
  const plans = planAuthoredProblems(questions, ctx, examLanguage);
  const firstId = await ensureDefaultProblem(m, sessionId);

  // 5.2: mỗi câu một yêu cầu nộp. Chưa khai yêu cầu nộp nào thì tạo bai{i}.{cpp|py}; đã khai thì dùng đúng thứ tự.
  const deliverableIds: string[] = [];
  if (ctx.deliverables.length > 0) {
    deliverableIds.push(...ctx.deliverables.map((d) => d.id));
  } else {
    for (const plan of plans) {
      const extension = plan.language === 'python' ? 'py' : 'cpp';
      const [created] = await m.query(
        `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type, language)
         VALUES ($1, $2, 'code_project', $3) RETURNING id`,
        [sessionId, `bai${plan.ordinal}.${extension}`, plan.language],
      );
      deliverableIds.push(created.id as string);
    }
  }

  const out: { problemId: string; ordinal: number }[] = [];
  for (const plan of plans) {
    // 5.1: mỗi câu có rubric riêng, co giãn từ rubric mẫu của phiên theo điểm câu.
    const rubricId = await cloneRubricForQuestion(m, {
      teacherId,
      templateRubricId: ctx.rubricId as string,
      sessionCode: sessionRow.code as string,
      ordinal: plan.ordinal,
      pointsHundredths: plan.pointsHundredths,
    });
    const deliverableId = deliverableIds[plan.ordinal - 1];
    if (plan.ordinal === 1) {
      await m.query(
        `UPDATE examcollect.exam_problem
            SET title = $2, points_hundredths = $3, statement = $4, rubric_id = $5, language = $6,
                required_deliverable_id = $7
          WHERE id = $1`,
        [firstId, plan.title, plan.pointsHundredths, plan.statement, rubricId, plan.language, deliverableId],
      );
      out.push({ problemId: firstId, ordinal: 1 });
      continue;
    }
    const [row] = await m.query(
      `INSERT INTO examcollect.exam_problem
         (exam_session_id, ordinal, title, points_hundredths, statement, statement_quote, rubric_id, language,
          required_deliverable_id)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8) RETURNING id`,
      [sessionId, plan.ordinal, plan.title, plan.pointsHundredths, plan.statement, rubricId, plan.language, deliverableId],
    );
    out.push({ problemId: row.id as string, ordinal: plan.ordinal });
  }
  return out;
}

/**
 * Khoá giảng viên TRƯỚC, rồi hàng phiên `FOR UPDATE`: đúng thứ tự khoá của mọi đường ghi (xem `teacher-lock.ts`).
 * Trả id giảng viên chủ phiên. Mọi ghi cấu trúc câu đều đi qua đây.
 */
export async function lockSessionForWrite(m: EntityManager, sessionId: string): Promise<string> {
  const [owner] = await m.query(`SELECT teacher_id FROM examcollect.exam_session WHERE id = $1`, [sessionId]);
  if (!owner) {
    throw new NotFoundException('Không tìm thấy phiên thi.');
  }
  await lockTeacherScoring(m, owner.teacher_id as string);
  await m.query(`SELECT id FROM examcollect.exam_session WHERE id = $1 FOR UPDATE`, [sessionId]);
  return owner.teacher_id as string;
}

/** Đề cương đã xác nhận thì danh sách câu đã chốt: không thêm hay bỏ câu được nữa. */
async function assertBlueprintOpen(m: EntityManager, sessionId: string): Promise<void> {
  const [row] = await m.query(`SELECT blueprint_confirmed_at FROM examcollect.exam_session WHERE id = $1`, [sessionId]);
  if (row.blueprint_confirmed_at) {
    throw new ConflictException('phiên đã xác nhận đề cương — không thêm hay bỏ câu được nữa.');
  }
}

/**
 * Các đường ghi cấu trúc câu của một phiên (P1b Task 4, §10.3 mục (b)): thêm câu thủ công, bỏ câu, xác nhận đề
 * cương. Ownership do controller kiểm trước; service chỉ nhận `sessionId` đã xác thực.
 */
@Injectable()
export class ProblemService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Thêm câu vào cuối phiên. Ordinal là lớn nhất + 1, nên không đụng câu nào đã có kể cả khi có khoảng trống do
   * lần bỏ câu trước để lại. Rubric đưa vào là rubric mẫu, câu nhận rubric riêng co giãn theo điểm (5.1). D2: ngôn
   * ngữ phải khớp yêu cầu nộp đã chọn.
   */
  async appendProblem(sessionId: string, dto: AddProblemDto): Promise<{ problemId: string; ordinal: number }> {
    return this.ds.transaction(async (m) => {
      await lockSessionForWrite(m, sessionId);
      await assertBlueprintOpen(m, sessionId);

      // Review M5: phiên đã có bài chấm thì đường xuất sổ điểm đã chốt theo file; thêm câu lúc này đổi nó sang tổng theo câu
      // và làm lệch các điểm đã có. Từ chối trước khi tạo câu.
      const [graded] = await m.query(
        `SELECT EXISTS (SELECT 1 FROM examcollect.grading_result g
                          JOIN examcollect.submission s ON s.id = g.submission_id
                         WHERE s.exam_session_id = $1) AS graded`,
        [sessionId],
      );
      if (graded.graded as boolean) {
        throw new ConflictException('phiên đã có bài chấm — không thêm câu được nữa.');
      }

      const [deliverable] = await m.query(
        `SELECT language::text AS language FROM examcollect.required_deliverable WHERE id = $1 AND exam_session_id = $2`,
        [dto.requiredDeliverableId, sessionId],
      );
      if (!deliverable) {
        throw new BadRequestException('Yêu cầu nộp không thuộc phiên thi này.');
      }
      const declared = (deliverable.language as string | null) ?? 'chưa khai ngôn ngữ';
      if (declared !== dto.language) {
        throw new BadRequestException(`Yêu cầu nộp này dùng ${declared}, không phải ${dto.language}.`);
      }

      // 5.1: rubric đưa vào là rubric MẪU; câu thủ công nhận một rubric riêng co giãn theo điểm của mình. Rubric mẫu
      // phải thuộc giảng viên chủ phiên — kiểm trong `cloneRubricForQuestion`.
      const [sessionRow] = await m.query(`SELECT code, teacher_id FROM examcollect.exam_session WHERE id = $1`, [sessionId]);
      const [next] = await m.query(
        `SELECT COALESCE(MAX(ordinal), 0) + 1 AS next FROM examcollect.exam_problem WHERE exam_session_id = $1`,
        [sessionId],
      );
      const ordinal = next.next as number;
      const rubricId = await cloneRubricForQuestion(m, {
        teacherId: sessionRow.teacher_id as string,
        templateRubricId: dto.rubricId,
        sessionCode: sessionRow.code as string,
        ordinal,
        pointsHundredths: dto.pointsHundredths,
      });
      const [row] = await m.query(
        `INSERT INTO examcollect.exam_problem
           (exam_session_id, ordinal, title, points_hundredths, required_deliverable_id, language, rubric_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [sessionId, ordinal, dto.title, dto.pointsHundredths, dto.requiredDeliverableId, dto.language, rubricId],
      );
      return { problemId: row.id as string, ordinal };
    });
  }

  /**
   * Bỏ một câu. Từ chối câu 1 (câu mặc định, bí danh của phiên trỏ vào nó) và câu đã có kết quả, gói test hay
   * đáp án trỏ tới. Ba FK tới `exam_problem` đều RESTRICT và gói test là chỉ-thêm, nên đây là điều kiện DB
   * đòi, không phải lựa chọn nghiệp vụ.
   */
  async removeProblem(sessionId: string, problemId: string): Promise<void> {
    return this.ds.transaction(async (m) => {
      await lockSessionForWrite(m, sessionId);
      await assertBlueprintOpen(m, sessionId);

      const [row] = await m.query(
        `SELECT ordinal FROM examcollect.exam_problem WHERE id = $1 AND exam_session_id = $2`,
        [problemId, sessionId],
      );
      if (!row) {
        throw new NotFoundException('Không tìm thấy câu của phiên.');
      }
      if ((row.ordinal as number) === 1) {
        throw new ConflictException('Câu 1 là câu mặc định của phiên, không bỏ được.');
      }
      const [use] = await m.query(
        `SELECT (EXISTS (SELECT 1 FROM examcollect.grading_result WHERE problem_id = $1)
              OR EXISTS (SELECT 1 FROM examcollect.grading_test_bundle WHERE problem_id = $1)
              OR EXISTS (SELECT 1 FROM examcollect.grading_reference WHERE problem_id = $1)) AS used`,
        [problemId],
      );
      if (use.used) {
        throw new ConflictException(
          'Câu đã có kết quả chấm, gói test hoặc đáp án — không bỏ được (các bản ghi này chỉ thêm, không xoá).',
        );
      }
      await m.query(`DELETE FROM examcollect.exam_problem WHERE id = $1`, [problemId]);
    });
  }

  /** Bảng sinh viên của phiên (P1b Task 9): một dòng mỗi sinh viên, tổng và chip theo câu. Chỉ đọc. */
  async listStudents(sessionId: string): Promise<StudentBoardRow[]> {
    return loadStudentBoard(this.ds.manager, sessionId);
  }

  /**
   * Xác nhận đề cương: chốt danh sách câu. Idempotent: lần sau trả đúng thời điểm lần đầu. Phiên một câu mà
   * chưa có đáp án hay gói test thì từ chối, vì xác nhận một đề cương rỗng là chốt một thứ không tồn tại.
   */
  async confirmBlueprint(sessionId: string, teacherId: string): Promise<{ confirmedAt: string }> {
    return this.ds.transaction(async (m) => {
      await lockSessionForWrite(m, sessionId);
      const [session] = await m.query(
        `SELECT blueprint_confirmed_at,
                (SELECT COUNT(*)::int FROM examcollect.exam_problem p WHERE p.exam_session_id = $1) AS problems,
                EXISTS (SELECT 1 FROM examcollect.grading_reference r WHERE r.exam_session_id = $1
                         AND (r.model_answer_storage_key IS NOT NULL OR r.model_answer_note IS NOT NULL)) AS has_answer,
                EXISTS (SELECT 1 FROM examcollect.grading_test_bundle b WHERE b.exam_session_id = $1) AS has_bundle
           FROM examcollect.exam_session WHERE id = $1`,
        [sessionId],
      );
      if (session.blueprint_confirmed_at) {
        return { confirmedAt: new Date(session.blueprint_confirmed_at as string).toISOString() };
      }
      if ((session.problems as number) <= 1 && !session.has_answer && !session.has_bundle) {
        throw new BadRequestException(
          'Phiên có một câu mà chưa có đáp án hay gói test — không xác nhận đề cương rỗng.',
        );
      }
      await m.query(
        `UPDATE examcollect.exam_session SET blueprint_confirmed_at = now(), blueprint_confirmed_by = $2 WHERE id = $1`,
        [sessionId, teacherId],
      );
      // SELECT sau UPDATE, không `UPDATE … RETURNING`: cùng lý do với `adoptIn` trong test-bundle.service.
      const [confirmed] = await m.query(
        `SELECT blueprint_confirmed_at FROM examcollect.exam_session WHERE id = $1`,
        [sessionId],
      );
      return { confirmedAt: new Date(confirmed.blueprint_confirmed_at as string).toISOString() };
    });
  }
}
