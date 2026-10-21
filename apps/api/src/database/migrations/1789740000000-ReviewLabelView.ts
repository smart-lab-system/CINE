import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * View `examcollect.review_label_v` — nhãn đo thời gian duyệt (spec duyệt nhanh 2026-10-21 §5.5). View
 * chứ không bảng: mỗi bài một dòng, tính lại mỗi lần đọc từ ba bảng đã có; không có bản sao để lệch.
 *
 * Cột:
 * - `system_total`: điểm của lượt tính MỚI NHẤT (`created_at DESC, id DESC` — khuôn của
 *   `grade-export.data.ts` và `grading.service.ts`). NULL khi bài chưa có lượt tính hoặc lượt đó ra
 *   dưới sàn (`score_computation.score` nullable).
 * - `decision_kind`: `'auto'` khi bài không có dòng `teacher_review` nào; còn lại là `kind` của dòng
 *   MỚI NHẤT (`reviewed_at DESC, id DESC`), ép sang `text` để view không gắn chặt vào enum. Đây là
 *   dòng mới nhất theo đúng nghĩa đen, kể cả dòng `error_exception` (không có `final_score`): khi
 *   dòng mới nhất là ngoại lệ lỗi thì `teacher_total` NULL và `reviewed_at` là lúc ghi ngoại lệ.
 * - `teacher_total`, `reviewed_at`: của chính dòng đó.
 * - `review_seconds` = `reviewed_at - opened_at` tính bằng giây (numeric); NULL khi thiếu một trong
 *   hai mốc, HOẶC khi `reviewed_at < opened_at` (bài được duyệt trước khi có mốc mở — chẳng hạn duyệt
 *   hàng loạt rồi mới mở xem): một thời lượng âm không phải số đo, để NULL thì trung bình không bị
 *   kéo lệch. Bài chốt thẳng (`auto_approved → finalized`) không có dòng giảng viên nên là `auto`
 *   với `review_seconds` NULL.
 *
 * Không dùng literal enum nào trong view (`kind::text`), nên chạy được cả khi cả loạt migration nằm
 * trong một giao dịch.
 */
export class ReviewLabelView1789740000000 implements MigrationInterface {
  name = 'ReviewLabelView1789740000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE VIEW "examcollect"."review_label_v" AS
      SELECT g.id                            AS result_id,
             g.pipeline                      AS pipeline,
             g.status                        AS status,
             sc.score                        AS system_total,
             COALESCE(tr.kind::text, 'auto') AS decision_kind,
             tr.final_score                  AS teacher_total,
             g.opened_at                     AS opened_at,
             tr.reviewed_at                  AS reviewed_at,
             CASE WHEN g.opened_at IS NOT NULL AND tr.reviewed_at IS NOT NULL AND tr.reviewed_at >= g.opened_at
                  THEN EXTRACT(EPOCH FROM (tr.reviewed_at - g.opened_at))::numeric
             END                             AS review_seconds
        FROM "examcollect"."grading_result" g
        LEFT JOIN LATERAL (
          SELECT c.score FROM "examcollect"."score_computation" c
           WHERE c.grading_result_id = g.id
           ORDER BY c.created_at DESC, c.id DESC LIMIT 1) sc ON true
        LEFT JOIN LATERAL (
          SELECT t.kind, t.final_score, t.reviewed_at FROM "examcollect"."teacher_review" t
           WHERE t.grading_result_id = g.id
           ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 1) tr ON true
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP VIEW "examcollect"."review_label_v"`);
  }
}
