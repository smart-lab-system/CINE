# Calibration — đo xem AI chấm gần người chấm tới đâu

> **Đọc mục "Cảnh báo phương pháp" TRƯỚC khi chạy bất cứ thứ gì.** Nó không
> phải lời rào đón: chạy sai cách sẽ cho ra một con số trông hợp lý và nói
> ngược lại sự thật.

Thư mục này nằm **ngoài `apps/`** vì nó không phải một phần của ứng dụng
đang chạy. Nó là công cụ phân tích offline: đọc Postgres, tính, in ra.
Không FastAPI, không LangChain, không nằm trong đường chạy request
(spec §11.6).

---

## Cảnh báo phương pháp — §11.1

**Nếu báo cáo kappa tổng thể, bạn sẽ tự giấu mất kết quả của mình.**

Luận điểm của đồ án sống ở **~20% bài lệch rubric**. Với 80% bài bình
thường, mọi nhánh — kể cả hệ rubric-only — đều đồng thuận cao. Gộp thành
một con số thì thất bại của nhánh cũ trên 20% kia bị pha loãng tới mức vô
hình, và báo cáo sẽ kết luận "AI chấm tốt" từ đúng tập dữ liệu chứng minh
điều ngược lại.

Vì thế `analyze.py` **từ chối chạy** khi cột `is_deviant` chưa được điền,
và **không có cờ nào để bỏ qua**. Một script in ra được con số tổng thể là
một script sẽ được dùng để kết luận sai.

**Ai đánh dấu `is_deviant`:** người chấm độc lập, đánh dấu **mù**, **trước**
khi nhìn output của AI. Không phải hệ thống tự phân loại rồi tự chấm điểm
mình trên phân loại đó — đó là một vòng tròn, không phải một phép đo.

---

## Chạy gì, theo thứ tự nào

### 1. Hai chỉ số miễn phí — chạy được NGAY HÔM NAY

```bash
docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect \
  -f - < scripts/calibration/free-metrics.sql
```

**Không cần cài gì.** SQL thuần, vì hai chỉ số này là phép **đếm**, không
phải phép thống kê — bắt người ta cài pandas + scipy để chạy `count(*)` là
dựng rào chắn trước đúng cái số liệu đáng lẽ có sẵn.

Nó in ra:

| # | Chỉ số | Ý nghĩa |
|---|---|---|
| 1 | Tỉ lệ `unverified` | % tiêu chí mà dẫn chứng model trích **không định vị được** trong bài. Cũng là chỉ số nói G2 có đang **báo động giả** hay không (§6.3a) |
| 2 | Tỉ lệ phủ tiêu chí | % tiêu chí model không trích nổi dẫn chứng nào |
| 3 | Mức ngữ cảnh **thật sự** đã dùng | Nền để phân nhánh ở §11.2 |
| 4 | Giảng viên có sửa không | Dữ liệu **quan sát** — xem cảnh báo bên dưới |

Cả hai chỉ số đầu chạy trên **100% số bài production**, không cần tổ chức
buổi chấm mù nào. Tới lúc viết báo cáo là đã có dữ liệu cả học kỳ.

> ⚠️ **Độ phủ đo được.** Bảng đầu tiên nói bao nhiêu dòng thực sự đo được
> tỉ lệ `unverified`. Trường `check` chỉ được ghi từ **2026-09-15**; mọi
> dòng chấm trước đó không có nó. "Chưa đo" phải tách khỏi "đo ra 0", nếu
> không tỉ lệ sẽ trông đẹp một cách giả tạo.

### 2. Kappa + Pearson — cần một buổi chấm mù

```bash
pip install -r scripts/calibration/requirements.txt

export DATABASE_URL=postgresql://examcollect_admin:...@localhost:5442/examcollect
python scripts/calibration/export.py --out out/

#  ← BƯỚC NGƯỜI LÀM: đưa out/results.csv cho người chấm độc lập điền
#    cột `is_deviant` (1 = lệch rubric, 0 = bình thường), đánh dấu MÙ.

python scripts/calibration/analyze.py --in out/
```

---

## Nhánh được SUY RA, không gõ tay

§11.2 định nghĩa bốn nhánh theo ngữ cảnh mà lượt chấm có:

| Nhánh | Context | Trả lời câu |
|---|---|---|
| **A** | rubric + bài làm | Đường cơ sở — hệ thống trước khi có gì thêm |
| **B** | A + đề bài + đáp án mẫu | Neo ngữ cảnh có giúp không? |
| **C** | B + Advocate | Ý kiến phản biện có giúp thêm? |
| **D** | C + anchor | Học từ giảng viên có giúp thêm? *(chưa xây)* |

`export.py` **suy ra** nhánh từ `context_used_question`,
`context_used_model_answer` và `advocate_opinion` — ba cột do chính
provider khai lúc chấm. Gõ tay là mở cửa cho việc gán nhãn theo thứ người
ta *tin* là đã chạy thay vì thứ đã chạy thật.

**Nhánh `?`** = chấm trước khi hệ thống biết ghi lại mức ngữ cảnh
(`context_used_* IS NULL`). **Đừng gộp vào A** — gộp là bịa ra một sự thật
lịch sử, và làm bẩn đúng cái nhánh cơ sở mà mọi so sánh dựa vào.

---

## Báo cáo hai lớp — §11.3

**Tập nhỏ chấm mù (vàng).** So 3–4 nhánh trên cùng một tập, cùng một người
đối chiếu. Đây là thứ đi vào phần kết quả.

**Tập production lớn (quan sát).** Mỗi lần giảng viên sửa điểm là một cặp
nhãn; sau một học kỳ có hàng trăm cặp mà không tổ chức thí nghiệm nào.

> ⚠️ **Điểm yếu phải ghi rõ trong báo cáo:** dữ liệu production **bị neo** —
> giảng viên nhìn đề xuất của AI **trước** khi sửa. Nó nói về **quy mô và
> xu hướng**, và **không thay thế được** tập chấm mù. Đừng trình nó như
> bằng chứng về độ chính xác.

---

## Chỉ có MỘT người chấm — và điều đó nghĩa là gì

Không có trần người-người, nên **kappa tuyệt đối không diễn giải được**:
hội đồng hỏi *"0,72 là tốt hay tệ?"* và không ai trả lời được.

**Cách xử lý:** chuyển sang so sánh **tương đối**. Ba nhánh chấm cùng tập,
đối chiếu cùng một người. Câu hỏi là *nhánh nào gần người chấm hơn*. Thiết
kế within-subject, người chấm là mốc cố định — chênh lệch giữa các nhánh
vẫn có nghĩa dù mốc ở đâu. **Và đó chính xác là luận điểm cần chứng minh.**

**Khuyến nghị, không bắt buộc:** cùng giảng viên chấm lại chính tập đó sau
2–3 tuần, mù, không nhìn lần chấm cũ → *intra-rater reliability*, một cái
trần thật, tốn ~30 phút của một người. Phương pháp chuẩn, có tên.

---

## Vì sao báo cáo CẢ kappa lẫn Pearson

- **Cohen's kappa** trên verdict từng tiêu chí — verdict vốn là
  categorical, kappa là đúng công cụ.
- **Pearson** trên tổng điểm.

Pearson có thể **cao trong khi kappa thấp**: AI bù trừ sai số giữa các tiêu
chí để ra đúng tổng. Tổng đúng, lý do sai. **Chênh lệch giữa hai chỉ số tự
nó là một phát hiện**, nên báo cáo cả hai.
