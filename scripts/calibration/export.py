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
    (gr.advocate_opinion IS NOT NULL) AS co_advocate,
    tr.final_score,
    tr.reviewed_at
FROM examcollect.grading_result gr
JOIN examcollect.submission s   ON s.id = gr.submission_id
JOIN examcollect.exam_session es ON es.id = s.exam_session_id
LEFT JOIN examcollect.teacher_review tr ON tr.grading_result_id = gr.id
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
LEFT JOIN examcollect.teacher_review tr ON tr.grading_result_id = gr.id
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
    if row["co_advocate"]:
        return "C"
    if row["context_used_question"] or row["context_used_model_answer"]:
        return "B"
    return "A"


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
