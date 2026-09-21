"""Rút dữ liệu calibration từ Postgres ra CSV.

Chạy:
    pip install -r scripts/calibration/requirements.txt
    python scripts/calibration/export.py --out out/

Sinh ra hai file:
    criteria.csv  — một dòng MỖI TIÊU CHÍ (nguồn cho Cohen's kappa)
    results.csv   — một dòng MỖI BÀI      (nguồn cho Pearson, và là chỗ
                    người chấm độc lập điền cột `is_deviant`)

CỘT `is_deviant` ĐƯỢC ĐỂ TRỐNG CÓ CHỦ Ý — xem README §"Cảnh báo phương pháp".
Nó phải do NGƯỜI CHẤM ĐỘC LẬP điền, đánh dấu mù, TRƯỚC khi nhìn output AI.
Hệ thống tự phân loại rồi tự chấm điểm mình trên phân loại đó là một vòng
tròn, không phải một phép đo.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path

try:
    import psycopg2
except ImportError:  # pragma: no cover - lỗi môi trường, không phải lỗi logic
    sys.exit(
        "Thiếu psycopg2. Chạy: pip install -r scripts/calibration/requirements.txt"
    )


# Một dòng mỗi BÀI. `branch` suy ra từ dữ liệu đã lưu chứ không gán tay —
# xem README §"Nhánh được SUY RA".
#
# ⚠️ `LEFT JOIN LATERAL ... LIMIT 1`, KHÔNG phải `LEFT JOIN` thường.
#
# `teacher_review` KHÔNG có ràng buộc unique trên `grading_result_id`, và
# đó là thiết kế: Security rule 6 nói mỗi lần sửa điểm tạo một DÒNG MỚI,
# không ghi đè. Index `(grading_result_id, reviewed_at DESC)` có sẵn chính
# là để lấy lần duyệt mới nhất.
#
# Một `LEFT JOIN` thường sẽ nhân bản bài: một bài duyệt hai lần ra hai
# dòng CSV với hai `final_score` khác nhau. Pearson khi đó tương quan cùng
# một điểm AI với nhiều điểm người, và kappa đếm trùng cặp verdict — con
# số trông vẫn hợp lý, chỉ là sai. Dev DB hiện có 0 ca trùng, nên lỗi này
# nằm im cho tới đúng lúc chạy trên dữ liệu thật để viết báo cáo.
RESULTS_SQL = """
SELECT
    gr.id                          AS grading_result_id,
    s.student_mssv,
    es.id                          AS exam_session_id,
    es.semester_name,
    gr.rubric_id_version,
    gr.model_used,
    gr.ai_total_score,
    gr.confidence,
    gr.status,
    gr.context_used_question,
    gr.context_used_model_answer,
    -- `= 'completed'`, KHÔNG phải `IS NOT NULL`.
    --
    -- `advocate_outcome` phân biệt bốn ca mà `advocate_opinion` gộp làm
    -- một: `not_needed`, `skipped`, `failed`, `completed`. Chỉ ca cuối mới
    -- là "nhánh này đã thực sự chạy". Xếp `failed` vào nhánh B là bịa ra
    -- một sự thật lịch sử — đúng cái mà cảnh báo về nhánh `?` trong README
    -- tồn tại để chặn.
    --
    -- `NULL` = chấm trước 2026-09-20, khi hệ thống chưa biết ghi lại điều
    -- này. Nó rơi vào nhánh `?`, không phải B.
    (gr.advocate_outcome = 'completed') AS co_advocate,
    gr.advocate_outcome,
    tr.final_score,
    tr.reviewed_at
FROM examcollect.grading_result gr
JOIN examcollect.submission s   ON s.id = gr.submission_id
JOIN examcollect.exam_session es ON es.id = s.exam_session_id
LEFT JOIN LATERAL (
    SELECT t.final_score, t.reviewed_at
    FROM examcollect.teacher_review t
    WHERE t.grading_result_id = gr.id
    ORDER BY t.reviewed_at DESC
    LIMIT 1
) tr ON true
WHERE gr.ai_total_score IS NOT NULL
ORDER BY es.id, s.student_mssv
"""

# Một dòng mỗi TIÊU CHÍ, ghép verdict của AI với verdict giảng viên sửa.
# Ghép theo `criterionId`, KHÔNG theo chỉ số mảng: hai mảng không hứa cùng
# thứ tự, và ghép lệch một ô sẽ so verdict của tiêu chí này với tiêu chí
# khác — một sai lệch câm, ra một con số kappa trông vẫn hợp lý.
CRITERIA_SQL = """
SELECT
    gr.id                AS grading_result_id,
    gr.model_used,
    gr.criterion_results,
    tr.edited_criteria
FROM examcollect.grading_result gr
LEFT JOIN LATERAL (
    SELECT t.edited_criteria
    FROM examcollect.teacher_review t
    WHERE t.grading_result_id = gr.id
    ORDER BY t.reviewed_at DESC
    LIMIT 1
) tr ON true
WHERE gr.ai_total_score IS NOT NULL
  AND jsonb_array_length(gr.criterion_results) > 0
"""


def derive_branch(row: dict) -> str:
    """Nhánh §11.2, SUY RA từ cột đã lưu — không ai gõ tay.

    Gõ tay là mở cửa cho việc một dòng bị gán nhãn theo thứ người ta TIN
    là đã chạy thay vì thứ đã chạy thật. `context_used_*` được chính
    provider khai lúc chấm, nên nó là sự thật gần nhất ta có.

    `NULL` (chấm trước khi hệ thống biết ghi lại) KHÔNG được coi là
    `false` — nó thành nhánh riêng `?`, vì gộp nó vào A là bịa ra một
    sự thật lịch sử và làm bẩn đúng nhánh cơ sở.
    """
    if row["context_used_question"] is None:
        return "?"

    has_context = bool(row["context_used_question"] or row["context_used_model_answer"])

    if row["co_advocate"]:
        # Nhánh C là "B + Advocate", nên nó BAO HÀM việc có ngữ cảnh. Hôm
        # nay `runAdvocate` trả `outcome = 'skipped'` khi
        # `loadedLevel === 'rubric_only'`, nên `co_advocate` là false và ca
        # này không xảy ra được — nhưng nó là một BẤT BIẾN Ở FILE KHÁC, và
        # bất biến do người khác giữ thì phải kiểm chứ không tin. Nếu nó
        # vỡ, dòng đó phải thành `?` để người đọc thấy có gì lạ, chứ không
        # lặng lẽ được xếp vào C và làm bẩn so sánh B→C.
        return "C" if has_context else "?"

    return "B" if has_context else "A"


def export_results(cur, out_dir: Path) -> int:
    cur.execute(RESULTS_SQL)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    path = out_dir / "results.csv"
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "grading_result_id",
                "student_mssv",
                "exam_session_id",
                "semester_name",
                "rubric_id_version",
                "model_used",
                "branch",
                # Cột thô đi kèm `branch`, không thay nó. `branch` trả lời
                # "nhánh nào đã chạy"; cột này trả lời "vì sao nó KHÔNG
                # chạy" — và `failed` là tín hiệu về hạ tầng, không phải
                # về phương pháp. Không có nó thì một đợt hỏng gateway
                # đọc ra y hệt một đợt phản biện không được bật.
                "advocate_outcome",
                "ai_total_score",
                "confidence",
                "final_score",
                "status",
                # ĐỂ TRỐNG. Người chấm độc lập điền 1 (lệch rubric) hoặc
                # 0 (bình thường), đánh dấu MÙ, trước khi nhìn cột nào ở
                # bên trái. `analyze.py` từ chối chạy nếu cột này trống.
                "is_deviant",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row["grading_result_id"],
                    row["student_mssv"],
                    row["exam_session_id"],
                    row["semester_name"],
                    row["rubric_id_version"],
                    row["model_used"] or "",
                    derive_branch(row),
                    row["advocate_outcome"] or "",
                    row["ai_total_score"],
                    row["confidence"],
                    row["final_score"] if row["final_score"] is not None else "",
                    row["status"],
                    "",
                ]
            )
    return len(rows)


def export_criteria(cur, out_dir: Path) -> int:
    cur.execute(CRITERIA_SQL)
    written = 0
    path = out_dir / "criteria.csv"
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "grading_result_id",
                "model_used",
                "criterion_id",
                "ai_verdict",
                "teacher_verdict",
                "evidence_check",
                "evidence_empty",
            ]
        )
        for grading_result_id, model_used, ai_raw, teacher_raw in cur.fetchall():
            ai_rows = ai_raw if isinstance(ai_raw, list) else json.loads(ai_raw or "[]")
            teacher_rows = teacher_raw if isinstance(teacher_raw, list) else (
                json.loads(teacher_raw) if teacher_raw else []
            )
            by_id = {
                c.get("criterionId"): c
                for c in teacher_rows
                if isinstance(c, dict) and c.get("criterionId")
            }

            for crit in ai_rows:
                if not isinstance(crit, dict):
                    continue
                cid = crit.get("criterionId")
                teacher = by_id.get(cid) or {}
                writer.writerow(
                    [
                        grading_result_id,
                        model_used or "",
                        cid or "",
                        crit.get("verdict") or "",
                        teacher.get("verdict") or "",
                        # Rỗng = chấm TRƯỚC 2026-09-15, khi hệ thống chưa
                        # ghi lại kết quả kiểm. Khác hẳn 'ok'.
                        crit.get("check") or "",
                        "1" if not str(crit.get("evidence") or "").strip() else "0",
                    ]
                )
                written += 1
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="out", help="Thư mục ghi CSV")
    parser.add_argument(
        "--dsn",
        default=os.environ.get("DATABASE_URL"),
        help="Chuỗi kết nối Postgres (mặc định: biến môi trường DATABASE_URL)",
    )
    args = parser.parse_args()

    if not args.dsn:
        sys.exit(
            "Chưa có DSN. Đặt DATABASE_URL hoặc truyền --dsn.\n"
            "Ví dụ: --dsn postgresql://user:pass@localhost:5442/examcollect"
        )

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    with psycopg2.connect(args.dsn) as conn, conn.cursor() as cur:
        n_results = export_results(cur, out_dir)
        n_criteria = export_criteria(cur, out_dir)

    print(f"results.csv  : {n_results} bài")
    print(f"criteria.csv : {n_criteria} tiêu chí")
    print()
    print("BƯỚC TIẾP THEO, và nó KHÔNG tự động được:")
    print("  Đưa results.csv cho người chấm độc lập điền cột `is_deviant`")
    print("  (1 = bài lệch rubric, 0 = bình thường), đánh dấu MÙ, TRƯỚC khi")
    print("  nhìn cột ai_total_score. analyze.py từ chối chạy nếu cột trống.")


if __name__ == "__main__":
    main()
