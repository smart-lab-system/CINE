import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GradingResultEntity } from './entities/grading-result.entity';
import { Anchor } from './ai-provider/anchor.types';
import { ANCHOR_MAX_PER_CRITERION, ANCHOR_MAX_TOKENS } from './grading.types';

/**
 * Dựng tập anchor cho một rubric version.
 *
 * KHÔNG phải RAG, và §10.2 ghi rõ vì sao: một rubric version, một môn,
 * một học kỳ cho ~100-300 lần sửa × ~200 token = 20k-60k token, trong khi
 * cửa sổ là 1M. Toàn bộ kho vừa trong context. Lý do tồn tại của RAG —
 * "nhiều quá không nhét vừa" — không áp dụng. Và retrieval còn tệ hơn:
 * đoạn lấy về đổi theo từng bài → tiền tố đổi mỗi lời gọi → mất cache
 * toàn bộ phần phía sau, tức trả giá đầy đủ 40 lần để giải một vấn đề
 * chưa có.
 *
 * Ngưỡng chuyển sang RAG, ghi ra để đó là quyết định có mốc: khi tập
 * anchor của MỘT rubric version vượt 100.000 token, hoặc khi phải trải
 * trên nhiều rubric version cùng lúc.
 */

interface CriterionRow {
  criterionId?: unknown;
  verdict?: unknown;
  evidence?: unknown;
}

interface ReviewRow {
  review_id: string;
  reviewed_at: Date;
  criterion_results: unknown;
  edited_criteria: unknown;
}

/**
 * Ước lượng token từ ký tự.
 *
 * Chia 3 chứ không chia 4: tiếng Việt có dấu tốn nhiều token hơn tiếng
 * Anh trên cùng số ký tự. Ước lượng THẤP hơn thực tế sẽ cắt hơi nhiều —
 * chấp nhận được; ước lượng CAO hơn thực tế sẽ vượt trần — không.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

@Injectable()
export class AnchorService {
  private readonly logger = new Logger(AnchorService.name);

  constructor(
    @InjectRepository(GradingResultEntity)
    private readonly results: Repository<GradingResultEntity>,
  ) {}

  /**
   * Mọi anchor dùng được cho một rubric version, đã sắp tất định và đã cắt
   * theo trần.
   *
   * Gọi ĐÚNG MỘT LẦN cho mỗi lượt chấm, lúc bấm "Bắt đầu chấm" (A3) — xem
   * `GradingRunService`. Gọi lại giữa lượt là phá đúng thứ A3 sinh ra để
   * giữ.
   */
  async buildFor(rubricIdVersion: string): Promise<Anchor[]> {
    // A1 — khoá theo `rubric_id_version`, ép ở SQL.
    //
    // Anchor của v1 áp cho v3 là dạy một chuẩn đã lỗi thời; đây là Security
    // rule 7 (rubric versioning) nối dài sang tầng prompt.
    //
    // A4 — thứ tự TẤT ĐỊNH, cũng ép ở SQL. Thứ tự đổi = byte đổi = cache
    // chết. Sắp theo `(reviewed_at, id)` chứ không chỉ theo thời gian: hai
    // lần duyệt trong cùng một mili giây là chuyện có thật khi giảng viên
    // bấm duyệt hàng loạt.
    //
    // `DISTINCT ON` lấy lần duyệt MỚI NHẤT mỗi bài: `teacher_review` không
    // unique theo `grading_result_id` (Security rule 6 — mỗi lần sửa là một
    // dòng mới), nên join thường sẽ nạp cùng một bài nhiều lần với hai
    // nhãn khác nhau — dạy model hai điều trái ngược về cùng một đoạn văn.
    const rows: ReviewRow[] = await this.results.query(
      `
      SELECT DISTINCT ON (gr.id)
             tr.id           AS review_id,
             tr.reviewed_at,
             gr.criterion_results,
             tr.edited_criteria
        FROM examcollect.grading_result gr
        JOIN examcollect.teacher_review tr ON tr.grading_result_id = gr.id
       WHERE gr.rubric_id_version = $1
         AND gr.ai_total_score IS NOT NULL
         AND jsonb_typeof(tr.edited_criteria) = 'array'
       ORDER BY gr.id, tr.reviewed_at DESC
      `,
      [rubricIdVersion],
    );

    // Sắp lại ở tầng ứng dụng: `DISTINCT ON` buộc `ORDER BY` phải bắt đầu
    // bằng `gr.id`, nên thứ tự trả về là theo id bài chứ không theo thời
    // gian duyệt. A4 cần thứ tự theo thời gian.
    rows.sort((a, b) => {
      const byTime = a.reviewed_at.getTime() - b.reviewed_at.getTime();
      return byTime !== 0 ? byTime : a.review_id.localeCompare(b.review_id);
    });

    const anchors: Anchor[] = [];
    for (const row of rows) {
      anchors.push(...this.realEditsIn(row));
    }

    return this.cap(anchors);
  }

  /**
   * A3 — ĐÓNG BĂNG tập anchor cho một lượt chấm, tạo MỘT LẦN.
   *
   * Gọi từ `GradingRunService.startGrading`. Bấm "Bắt đầu chấm" lần hai
   * để chấm tiếp phần còn lại phải dùng lại đúng ảnh cũ — nếu không thì
   * chính thao tác resume lại phá cái mà A3 sinh ra để giữ: bài 1-5 và
   * bài 6-40 được chấm theo hai chuẩn khác nhau trong cùng một phiên.
   *
   * `ON CONFLICT DO NOTHING` thay vì đọc-rồi-ghi: hai lần bấm gần nhau
   * (hoặc hai tab) sẽ cùng thấy "chưa có" rồi cùng ghi, và bản ghi sau đè
   * bản trước — đúng cái đua mà `uq_anchor_snapshot_session` tồn tại để
   * chặn, nhưng chỉ chặn được nếu ta không tự ý ghi đè.
   *
   * KHÔNG gọi khi anchor đang tắt: một ảnh chụp rỗng ghi hôm nay sẽ bị
   * đọc lại như "lúc đó chưa có lần sửa nào" vào ngày bật tính năng.
   */
  async freezeFor(examSessionId: string, rubricIdVersion: string): Promise<Anchor[]> {
    const anchors = await this.buildFor(rubricIdVersion);

    await this.results.query(
      `
      INSERT INTO examcollect.grading_anchor_snapshot
             (exam_session_id, rubric_id_version, anchors)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (exam_session_id) DO NOTHING
      `,
      [examSessionId, rubricIdVersion, JSON.stringify(anchors)],
    );

    // Đọc LẠI thay vì trả `anchors` vừa dựng: nếu một lượt bấm trước đã
    // ghi ảnh chụp thì `DO NOTHING` bỏ qua lần ghi này, và thứ đúng để
    // trả về là ảnh CŨ — không phải tập vừa tính.
    //
    // `?? anchors` là nhánh không bao giờ chạy tới (vừa INSERT xong thì
    // hàng phải có). Giữ nó thay vì `!` để một sự cố DB không biến thành
    // một `TypeError` ở dòng khác, cách xa nguyên nhân.
    return (await this.loadFor(examSessionId)) ?? anchors;
  }

  /**
   * Đọc ảnh chụp đã đóng băng. `null` = phiên này chưa từng chụp (chấm
   * trước khi tính năng tồn tại, hoặc anchor đang tắt lúc bấm chấm).
   *
   * Khác `[]`, nghĩa là "đã chụp, và lúc đó chưa có lần sửa thật nào".
   */
  async loadFor(examSessionId: string): Promise<Anchor[] | null> {
    const rows: { anchors: Anchor[] }[] = await this.results.query(
      `SELECT anchors FROM examcollect.grading_anchor_snapshot WHERE exam_session_id = $1`,
      [examSessionId],
    );
    return rows.length > 0 ? rows[0].anchors : null;
  }

  /**
   * A2 — CHỈ lấy lần SỬA THẬT.
   *
   * Ràng buộc đắt nhất nếu bỏ qua, và nó hỏng trong im lặng.
   * `TeacherReviewService` luôn ghi TOÀN BỘ mảng tiêu chí vào
   * `edited_criteria`, kể cả đường tự-duyệt-hàng-loạt (`finalizeGrades`
   * chép thẳng `criterion_results` sang). Nên "có dòng review" KHÔNG đồng
   * nghĩa với "giảng viên đã sửa gì".
   *
   * Học từ "thầy bấm đồng ý" là dạy AI rằng nó đã đúng — vòng lặp tự khen
   * (§10.4), và nó siết dần mà không ai thấy.
   *
   * Ghép theo `criterionId`, không theo chỉ số mảng: hai mảng không hứa
   * cùng thứ tự, và lệch một ô sẽ gán nhãn của tiêu chí này cho tiêu chí
   * khác — một anchor dạy sai mà trông hoàn toàn hợp lệ.
   */
  private realEditsIn(row: ReviewRow): Anchor[] {
    const aiRows = Array.isArray(row.criterion_results)
      ? (row.criterion_results as CriterionRow[])
      : [];
    const teacherRows = Array.isArray(row.edited_criteria)
      ? (row.edited_criteria as CriterionRow[])
      : [];

    const teacherById = new Map<string, CriterionRow>();
    for (const c of teacherRows) {
      const id = typeof c?.criterionId === 'string' ? c.criterionId : null;
      if (id) {
        teacherById.set(id, c);
      }
    }

    const out: Anchor[] = [];
    for (const ai of aiRows) {
      const criterionId = typeof ai?.criterionId === 'string' ? ai.criterionId : null;
      if (!criterionId) {
        continue;
      }
      const teacher = teacherById.get(criterionId);
      const aiVerdict = typeof ai.verdict === 'string' ? ai.verdict : null;
      const teacherVerdict = typeof teacher?.verdict === 'string' ? teacher.verdict : null;

      if (!aiVerdict || !teacherVerdict || aiVerdict === teacherVerdict) {
        continue;
      }

      out.push({
        criterionId,
        studentExcerpt: typeof ai.evidence === 'string' ? ai.evidence : '',
        aiVerdict,
        teacherVerdict,
        reviewedAt: row.reviewed_at.toISOString(),
        reviewId: row.review_id,
      });
    }
    return out;
  }

  /**
   * Trần K mỗi tiêu chí, rồi trần token tổng (§10.0).
   *
   * Cắt phải TẤT ĐỊNH — cắt ngẫu nhiên là byte đổi mỗi lời gọi, đúng cái
   * A4 sinh ra để chặn. Đầu vào đã sắp theo `(reviewed_at, reviewId)`, và
   * hai vòng cắt dưới đây giữ nguyên thứ tự đó.
   *
   * Giữ lần sửa MỚI NHẤT mỗi tiêu chí, không phải lần cũ nhất: chuẩn chấm
   * của một giảng viên dịch chuyển trong kỳ, và thứ đáng dạy là chuẩn hiện
   * tại của họ.
   */
  private cap(anchors: Anchor[]): Anchor[] {
    const perCriterion = new Map<string, Anchor[]>();
    for (const anchor of anchors) {
      const bucket = perCriterion.get(anchor.criterionId) ?? [];
      bucket.push(anchor);
      perCriterion.set(anchor.criterionId, bucket);
    }

    const kept: Anchor[] = [];
    for (const bucket of perCriterion.values()) {
      kept.push(...bucket.slice(-ANCHOR_MAX_PER_CRITERION));
    }
    // Sắp lại lần cuối: gom theo tiêu chí ở trên đã phá thứ tự thời gian.
    kept.sort((a, b) =>
      a.reviewedAt === b.reviewedAt
        ? a.reviewId.localeCompare(b.reviewId)
        : a.reviewedAt.localeCompare(b.reviewedAt),
    );

    const withinBudget: Anchor[] = [];
    let tokens = 0;
    for (const anchor of kept) {
      const cost = estimateTokens(
        `${anchor.criterionId}${anchor.studentExcerpt}${anchor.aiVerdict}${anchor.teacherVerdict}`,
      );
      if (tokens + cost > ANCHOR_MAX_TOKENS) {
        // DỪNG HẲN, không "bỏ cái này rồi thử cái sau": bỏ giữa chừng làm
        // tập anchor phụ thuộc vào ĐỘ DÀI của từng mẩu, nên thêm một lần
        // sửa dài ở giữa kỳ sẽ đổi tập của mọi bài phía sau.
        this.logger.log(
          `tập anchor chạm trần ${ANCHOR_MAX_TOKENS} token — giữ ${withinBudget.length}/${kept.length}`,
        );
        break;
      }
      tokens += cost;
      withinBudget.push(anchor);
    }
    return withinBudget;
  }
}
