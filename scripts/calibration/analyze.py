"""Cohen's kappa + Pearson, PHÂN TẦNG bắt buộc (spec §11.1–§11.4).

Chạy:
    python scripts/calibration/analyze.py --in out/

Đọc `results.csv` và `criteria.csv` do `export.py` sinh ra.

VÌ SAO SCRIPT NÀY TỪ CHỐI CHẠY KHI `is_deviant` TRỐNG
-----------------------------------------------------
Trích §11.1:

    "Nếu báo cáo kappa tổng thể, bạn sẽ tự giấu mất kết quả của mình."

Luận điểm của cả đồ án sống ở ~20% bài LỆCH RUBRIC. Với 80% bài bình
thường, mọi nhánh — kể cả hệ rubric-only hôm nay — đều đồng thuận cao.
Gộp thành một con số thì thất bại của nhánh cũ trên 20% kia bị pha loãng
tới mức vô hình, và báo cáo sẽ kết luận "AI chấm tốt" từ đúng tập dữ liệu
chứng minh điều ngược lại.

Một script in ra được một con số tổng thể là một script SẼ được dùng để
kết luận sai — nên nó không in ra con số đó, dù có bị ép.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import pandas as pd
    from scipy.stats import pearsonr
    from sklearn.metrics import cohen_kappa_score
except ImportError:  # pragma: no cover
    sys.exit(
        "Thiếu thư viện. Chạy: pip install -r scripts/calibration/requirements.txt"
    )


VERDICTS = ["not_met", "partially_met", "met"]


def load(in_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    results = pd.read_csv(in_dir / "results.csv")
    criteria = pd.read_csv(in_dir / "criteria.csv")
    return results, criteria


def require_stratification(results: pd.DataFrame) -> None:
    """Chặn ngay, với thông điệp nói ĐƯỢC PHẢI LÀM GÌ."""
    reviewed = results[results["final_score"].notna()]
    if reviewed.empty:
        sys.exit(
            "Chưa có bài nào được giảng viên duyệt — không có gì để đối chiếu.\n"
            "Cần `teacher_review` trước khi calibration nói được điều gì."
        )

    marked = reviewed["is_deviant"].notna().sum()
    if marked < len(reviewed):
        sys.exit(
            f"DỪNG: {len(reviewed) - marked}/{len(reviewed)} bài chưa có `is_deviant`.\n"
            "\n"
            "Cột đó phải do NGƯỜI CHẤM ĐỘC LẬP điền, đánh dấu MÙ, TRƯỚC khi\n"
            "nhìn output của AI (spec §11.1). Hệ thống tự phân loại rồi tự\n"
            "chấm điểm mình trên phân loại đó là một vòng tròn.\n"
            "\n"
            "Script này KHÔNG có cờ để bỏ qua bước trên. Một con số kappa\n"
            "tổng thể sẽ pha loãng đúng 20% số bài mà cả đồ án nói về."
        )


def kappa_for(subset: pd.DataFrame) -> float | None:
    """Kappa trên verdict TỪNG TIÊU CHÍ — verdict vốn là categorical."""
    paired = subset[(subset["ai_verdict"].notna()) & (subset["teacher_verdict"].notna())]
    if len(paired) < 2:
        return None
    if paired["ai_verdict"].nunique() < 2 and paired["teacher_verdict"].nunique() < 2:
        # Cả hai phía chỉ có một nhãn: kappa không xác định (chia cho 0
        # trong công thức). Trả None thay vì một số vô nghĩa.
        return None
    return float(
        cohen_kappa_score(paired["ai_verdict"], paired["teacher_verdict"], labels=VERDICTS)
    )


def pearson_for(subset: pd.DataFrame) -> float | None:
    paired = subset[(subset["ai_total_score"].notna()) & (subset["final_score"].notna())]
    if len(paired) < 3:
        return None
    if paired["ai_total_score"].nunique() < 2 or paired["final_score"].nunique() < 2:
        return None
    r, _ = pearsonr(paired["ai_total_score"], paired["final_score"])
    return float(r)


def report(results: pd.DataFrame, criteria: pd.DataFrame) -> None:
    reviewed = results[results["final_score"].notna()].copy()
    reviewed["is_deviant"] = reviewed["is_deviant"].astype(int)
    by_result = criteria.merge(
        reviewed[["grading_result_id", "branch", "is_deviant"]],
        on="grading_result_id",
        how="inner",
    )

    print("=" * 72)
    print(" KAPPA + PEARSON, PHÂN TẦNG THEO `is_deviant`")
    print("=" * 72)
    print()
    print("Cả HAI chỉ số đều được báo cáo, và chênh lệch giữa chúng TỰ NÓ là")
    print("một phát hiện: Pearson cao trong khi kappa thấp nghĩa là AI bù trừ")
    print("sai số giữa các tiêu chí để ra đúng tổng — tổng đúng, lý do sai.")
    print()

    for label, deviant in (("BÌNH THƯỜNG", 0), ("LỆCH RUBRIC", 1)):
        sub_r = reviewed[reviewed["is_deviant"] == deviant]
        sub_c = by_result[by_result["is_deviant"] == deviant]
        print(f"--- {label} ({len(sub_r)} bài, {len(sub_c)} tiêu chí) ---")
        if sub_r.empty:
            print("    (không có bài nào)")
            print()
            continue

        for branch in sorted(sub_r["branch"].unique()):
            br_r = sub_r[sub_r["branch"] == branch]
            br_c = sub_c[sub_c["branch"] == branch]
            k = kappa_for(br_c)
            r = pearson_for(br_r)
            print(
                f"    nhánh {branch}: n={len(br_r):>4}  "
                f"kappa={_fmt(k)}  pearson={_fmt(r)}"
            )
        print()

    print("=" * 72)
    print(" ĐỌC CON SỐ TRÊN THẾ NÀO — §11.3")
    print("=" * 72)
    print()
    print("Chỉ có MỘT người chấm, nên KHÔNG có trần người-người. Kappa tuyệt")
    print("đối do đó KHÔNG diễn giải được: hội đồng hỏi '0,72 là tốt hay tệ?'")
    print("và không ai trả lời được.")
    print()
    print("Câu hỏi ĐÚNG là so sánh TƯƠNG ĐỐI: nhánh nào gần người chấm hơn.")
    print("Ba nhánh chấm cùng tập, đối chiếu cùng một người, nên người chấm là")
    print("mốc cố định — chênh lệch giữa các nhánh vẫn có nghĩa dù mốc ở đâu.")
    print("Và đó CHÍNH XÁC là luận điểm cần chứng minh.")
    print()
    print("Nhánh `?` = chấm trước khi hệ thống ghi lại mức ngữ cảnh thật sự.")
    print("Đừng gộp nó vào A: gộp là bịa ra một sự thật lịch sử.")


def _fmt(value: float | None) -> str:
    return "  n/a" if value is None else f"{value:>5.3f}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in", dest="in_dir", default="out", help="Thư mục chứa CSV")
    args = parser.parse_args()

    in_dir = Path(args.in_dir)
    if not (in_dir / "results.csv").exists():
        sys.exit(f"Không thấy {in_dir / 'results.csv'}. Chạy export.py trước.")

    results, criteria = load(in_dir)
    require_stratification(results)
    report(results, criteria)


if __name__ == "__main__":
    main()
