# Buổi thử chọn cách cô lập sandbox (spec 2026-09-20 §3.5)

**Ngày đo:** 2026-09-24 · **Commit:** `f02352e` (worker), đo pha A ở `31a861c`; mã đo không đổi giữa hai commit · **Máy:** máy thật — VM Google Compute Engine `n2d-standard-8` (AMD EPYC 7B13, 8 vCPU = 4 lõi vật lý × 2 luồng SMT, 31 GB RAM), Debian 13, Docker 29.8.1, runc 1.5.1, runsc release-20260921.0, zone `asia-northeast1-a`, không service account

## Câu hỏi
Chọn runtime (runc đã siết hay gVisor), cách bấm giờ (trong tiến trình hay cả tiến trình), và số
khe đo K — theo luật D1–D4 chốt trước khi đo (plan 2026-09-24-sandbox-worker, Task 9).

## Cấu hình lúc đo
- Toàn bộ systemd ghim vào lõi vật lý 0 (`CPUAffinity=0 4`). Đã kiểm: dockerd và containerd nằm trên `0,4`, còn container chạy đúng trên `--cpuset-cpus` của khe.
- Cặp SMT: (0,4) (1,5) (2,6) (3,7). Mỗi khe đo là trọn một lõi vật lý: `1,5|2,6|3,7`, tức có 3 khe. Pha B vì vậy chỉ đo K = 2; K = 4 bị bỏ qua.
- Ops Agent và OS Config đã tắt.
- Pha A bị dừng một lần theo yêu cầu, sau khi runc đã đủ 80/80 lượt, và trước khi spike tự sinh báo cáo. Bảng dưới được sinh bằng `--phase=report` từ `samples.jsonl` đã có; không đo lại.

## Kết quả (spike-out/report-draft.md, sau pha B)

### Máy

| Runtime | Máy | CPU | Kernel | Docker | Image |
|---|---|---|---|---|---|
| runc | instance-20260924-084904 | AMD EPYC 7B13 × 8 | Linux 6.12.107+deb13-cloud-amd64 | 29.8.1 | sha256:c73a7a377d3507f3bd0ea2b38f56dec621fa89f4744ed8409f0f730d568172b2<br>sha256:107cd8e1109af75cc29b78c6fde793442243decb584371514cce9c650935f79f |

### Cô lập và chi phí một ca

| Runtime | `test:sandbox` | Phát hiện tiến trình nền | p95 một ca kiểm (ms) |
|---|---|---|---|
| runc | xanh | có | 351 |
| runsc | **đỏ** | có | 386 |

`test:sandbox` trên runsc: 9 đỏ, 10 xanh (D2a).
- 8 test đỏ vì gVisor không có `/proc/sysvipc`. Lệnh kiểm IPC sau mỗi mẫu (review C1) không đọc được, nên mọi job đo ra `unavailable`. Đó là: T-ISO-8 phần sandbox, 4 test cache của C1, T-LANG-1, T-LANG-3 (phần đo) và T-ISO-7.
- T-ISO-2 (`pids: 32`) đỏ vì sandbox của gVisor không khởi động được: *"cannot create sandbox … waiting for sandbox to start: EOF"*.

Trên runc: `test:sandbox` 19/19. Bộ unit trên Linux: 611 passed, gồm các test chỉ chạy trên POSIX (umask 077, quyền thư mục job).

### Độ tản của phép đo — 8 lượt mỗi ô

Độ dốc là độ dốc log–log của trung vị theo n sau khi trừ `c`. Chỉ dùng để đo độ tản; kết luận lớp độ phức tạp là việc của bước 4 (§3.1).

| Runtime | Bấm giờ | K | Chương trình | Độ dốc TB | Độ lệch chuẩn độ dốc | CV TB | Độ lệch chuẩn độ dốc (số đo ngoài) | Lượt dùng được |
|---|---|---|---|---|---|---|---|---|
| runc | in_process | 1 | cpp-linear | 1.013 | 0.008 | 0.030 | — | 8/8 |
| runc | in_process | 1 | cpp-nlogn | 1.069 | 0.003 | 0.005 | — | 8/8 |
| runc | in_process | 1 | cpp-quadratic | 1.987 | 0.005 | 0.009 | — | 8/8 |
| runc | in_process | 1 | py-nlogn | 1.095 | 0.003 | 0.009 | — | 8/8 |
| runc | in_process | 1 | py-quadratic | 2.117 | 0.003 | 0.007 | — | 8/8 |
| runc | in_process | 2 | cpp-linear | 1.037 | 0.032 | 0.050 | — | 8/8 |
| runc | in_process | 2 | cpp-nlogn | 1.071 | 0.001 | 0.004 | — | 8/8 |
| runc | in_process | 2 | cpp-quadratic | 1.981 | 0.009 | 0.018 | — | 8/8 |
| runc | in_process | 2 | py-nlogn | 1.099 | 0.003 | 0.009 | — | 8/8 |
| runc | in_process | 2 | py-quadratic | 2.117 | 0.006 | 0.010 | — | 8/8 |
| runc | process | 1 | cpp-linear | 0.985 | 0.014 | 0.013 | — | 8/8 |
| runc | process | 1 | cpp-nlogn | — | — | — | — | 0/8 |
| runc | process | 1 | cpp-quadratic | — | — | — | — | 0/8 |
| runc | process | 1 | py-nlogn | — | — | — | — | 0/8 |
| runc | process | 1 | py-quadratic | — | — | — | — | 0/8 |
| runsc | in_process | 1 | cpp-linear | — | — | — | — | 0/8 |
| runsc | in_process | 1 | cpp-nlogn | — | — | — | — | 0/8 |
| runsc | in_process | 1 | cpp-quadratic | — | — | — | — | 0/8 |
| runsc | in_process | 1 | py-nlogn | — | — | — | — | 0/8 |
| runsc | in_process | 1 | py-quadratic | — | — | — | — | 0/8 |
| runsc | process | 1 | cpp-linear | — | — | — | — | 0/2 |

Vì sao `process` có 0/8 ở 4 chương trình: dữ liệu thô vẫn đẹp. Nhưng `c` của cả tiến trình khoảng 1,5 ms, nên luật t ≥ 20c (§3.1 chốt 1) chỉ giữ các điểm ≥ 30 ms. Ở các n của buổi thử, chỉ còn 2 điểm, dưới mức tối thiểu 3 điểm. `c` của `in_process` chỉ khoảng 140 ns.

Vì sao cột số đo ngoài trống: `c` của số đo ngoài khoảng 70 ms (chi phí `docker exec`). 20c = 1,4 s, nên không n nào đủ điểm. Xem mục *"Hệ quả cho spec"*.

### Quyết định theo luật D1–D4

- D1: in_process (ổn định ít nhất bằng bấm giờ cả tiến trình trên runc; process không đo được ở cpp-nlogn, cpp-quadratic, py-nlogn, py-quadratic)
- D2: runc — runsc trượt: test:sandbox xanh; cpp-linear: độ tản trong 1,2× runc; cpp-nlogn: độ tản trong 1,2× runc; cpp-quadratic: độ tản trong 1,2× runc; py-nlogn: độ tản trong 1,2× runc; py-quadratic: độ tản trong 1,2× runc
- D3: K = 1
- D4: dùng được — độ lệch chuẩn độ dốc ≤ 0,10 ở mọi chương trình C++

*(Ở D2, danh sách sau "runsc trượt:" là các điều kiện runsc **không** đạt.)*

**Kết luận máy tính:** runtime `runc`, bấm giờ `in_process`, K = 1, dùng được.

Hai ghi chú về cách ra quyết định:
- Lần sinh báo cáo đầu tiên ra `process` và "không dùng được". Nguyên nhân là lỗi ở luật D1: bản sửa review M9 đòi **cả hai** cách bấm giờ phải có số hữu hạn. Lỗi đã sửa ở `f02352e`: `in_process` phải đo được; nếu `process` không đo được thì `in_process` thắng, đúng nghĩa "≤" của luật gốc. Không ngưỡng nào bị đổi.
- K = 2 trượt D3 vì độ tản của `cpp-linear` tăng 4× (0,008 → 0,032) và của `cpp-quadratic` tăng 2×. Con số tuyệt đối vẫn thấp hơn nhiều ngưỡng 0,10 của D4. Muốn lấy thông lượng của K = 2 thì phải đổi ngưỡng D3, và việc đó cần chủ đồ án quyết, ghi lý do.

## Đo khi có tải job kiểm (review I7)

Khe `1,5`, K = 1, trong khi 4 container liên tục biên dịch và chạy một bài sắp xếp 4M phần tử trên lõi chung `2,3,6,7`, để mô phỏng job kiểm chạy song song. CPU toàn máy khoảng 55%.

| Chương trình | Độ dốc TB | Độ lệch chuẩn độ dốc | CV TB | So với máy rảnh (K = 1) | Lượt dùng được |
|---|---|---|---|---|---|
| cpp-linear | 0.994 | 0.013 | 0.043 | 0,008 → 0,013 (1,6×) | 8/8 |
| cpp-quadratic | 1.984 | 0.006 | 0.013 | 0,005 → 0,006 | 8/8 |
| py-quadratic | 2.118 | 0.003 | 0.006 | 0,003 → 0,003 | 8/8 |

Tải của job kiểm làm độ tản tăng ít hơn K = 2. Chương trình tuyến tính (nặng về bộ nhớ) chịu nhiều nhất. Mọi con số vẫn thấp hơn nhiều ngưỡng 0,10 của D4, và độ dốc vẫn đúng. Cấu hình đã chọn dùng được khi có tải thật.

## Vòng job qua Redis

Worker chạy như dịch vụ systemd trên VM, dùng Redis Aiven (Valkey) của API qua user ACL `cine-sbx-worker`. 50 job, client chạy trên chính VM:

> vòng job (Redis → biên dịch → 1 ca → Redis): **p50 1248 ms · p95 1280 ms**; riêng một ca: **p50 298 ms · p95 337 ms**

Vòng job gồm cả biên dịch, nên lớn hơn "p95 một ca". 25 lời gọi mỗi bài × 1,28 s là khoảng 32 s, so với trần 300 s của §7.

## Test chấm thật đầu-cuối

Máy dev đóng vai API: gửi job qua Aiven, worker trên VM chấm, kết quả trả về qua Aiven. Đề: sắp xếp tăng dần.

| Job | Kết quả | Thời gian |
|---|---|---|
| C++ đúng | biên dịch ok · 3/3 pass | 3,5 s |
| C++ sai (sắp giảm dần) | 2 fail kèm `diff` đúng dòng lệch, 1 pass (dãy một phần tử) | 2,6 s |
| C++ vòng lặp vô hạn | `timeout` | 4,0 s |
| C++ lỗi biên dịch | biên dịch lỗi, không chạy ca nào | 1,1 s |
| C++ crash (`vector::at` ngoài biên) | `runtime_crash` | 1,4 s |
| Python đúng | 3/3 pass | 2,6 s |
| Đo: bubble sort vs `std::sort`, n = 2048…16384 | độ dốc **2,03** vs **1,05**; checksum bài = đáp án ở mọi n; 24 mẫu | 8,4 s |

Lượt đầu, bài "vô hạn" viết bằng `volatile int x; for(;;) x++;` ra `runtime_crash`, không phải `timeout`. Đó là hành vi đúng: UBSan (bật mặc định cho job kiểm C++) bắt tràn số nguyên có dấu. Lượt chạy lại với vòng lặp không có hành vi không xác định ra `timeout`.

Test này dùng credential của `cine-sbx-worker` từ máy dev. Mật khẩu của `cine-sbx-api` trong `apps/api/.env` bị chép nhầm (trùng mật khẩu worker), nên cần kiểm lại riêng khi sửa. Hai user có cùng bộ quyền.

## Hệ quả cho spec

- **K = 1:** một job đo mất 14–24 s (trung vị theo chương trình, 6 điểm n × 5 lượt × 2 chương trình). Một phiên 40 bài, mỗi bài một job đo, là khoảng 9,5–16 phút xếp hàng (40 × 14,3 s tới 40 × 23,9 s), dưới mục tiêu 30 phút của §15.2. Mỗi bài cần nhiều job đo thì nhân tương ứng: 2 job mỗi bài là 19–32 phút, tức sát hoặc vượt nhẹ 30 phút ở trường hợp xấu nhất (đề Python).
- **Không cần sửa rủi ro 1 của §11:** D4 đạt, và thời lượng nằm trong mục tiêu.
- **`docker top` trên runsc:** chạy được. D2b đạt: trên runsc, `forker` vẫn bị phát hiện là `interference`.
- **Việc cho bước 4 — luật mâu thuẫn của T-ISO-8 cần thiết kế lại.** Spec §3.5 định so *lớp* độ phức tạp suy từ số đo ngoài với lớp suy từ số đo trong. Đo thật cho thấy lớp suy từ số đo ngoài **không tính được** ở n khả thi: `c` ngoài khoảng 70 ms, 20c = 1,4 s mỗi điểm. Dữ liệu cho thấy một phép so theo từng n dùng được: số đo ngoài − c phải cùng cỡ với số đo trong. Ví dụ `cpp-quadratic` ở n = 32768: ngoài − c ≈ 171 ms, trong 117 ms. Bài in thời gian giả sẽ lộ khoảng cách hàng chục lần. Cần chủ đồ án duyệt trước khi bước 4 viết luật.
- **Bấm giờ cả tiến trình cần n lớn hơn nhiều** (≥ 30 ms mỗi điểm với C++, lớn hơn nữa với Python). Đề chỉ có dạng stdin/stdout sẽ tốn thời gian đo hơn hẳn đề có chữ ký hàm. Bước 4 nên ưu tiên đề khai chữ ký hàm.
- **Điều gì làm kết luận này sai:**
  - Đổi loại máy (dấu vân tay khác); Google đổi nền phần cứng của `n2d`; hay live migration giữa phép đo (`onHostMaintenance: MIGRATE`).
  - Tải thật nặng hơn tải mô phỏng, ví dụ nhiều job ASan cùng lúc.
  - Bộ chương trình của buổi thử không đại diện cho đề thật: 5 chương trình, n theo lũy thừa 2.
  - runsc có thể dùng được về sau nếu có cách kiểm IPC không qua `/proc` và trần pids phù hợp. Khi đó phải đo lại D2.
