# P1b — báo cáo nghiệm thu (2026-10-17)

**Kết luận: CHƯA NGHIỆM THU.** Nhánh `feat/multi-problem-p1b` (local, chưa push, chưa merge) đã hoàn thành các Task 0–10 và một đợt sửa sau review, nhưng: (a) review cuối trả **CHANGES REQUIRED**; (b) hai mục nghiệm thu của Task 11 (diễn tập một câu trên Railway, kịch bản ba câu) chưa chạy; (c) M3 chưa áp lên Supabase, và đây là điều kiện trước khi merge. Không merge nếu chưa có quyết định của chủ đồ án (mục 5).

## 1. Phạm vi

- Nhánh: `feat/multi-problem-p1b`, từ `4301be1` (main) đến `449972f`, 17 commit.
- Plan: `docs/superpowers/plans/2026-10-17-multi-problem-p1b.md`. Spec: `docs/superpowers/specs/2026-10-12-multi-problem-grading-design.md`.
- Sổ ghi quyết định (ruling) và sổ tiến độ: `.superpowers/sdd/2026-10-17-multi-problem-p1b/progress.md` (không commit).

## 2. Kết quả kiểm chứng

### 2.1 Bộ hồi quy đầy đủ (Task 11 Step 1)

| Lượt | Commit | tsc | check:cycles | eslint | unit `src` | e2e tuần tự |
|---|---|---|---|---|---|---|
| 1 (trước sửa review) | `2f69229` | 0 lỗi | 0 vòng | 0 lỗi, 7 cảnh báo (có sẵn) | 155 suite đạt, 2 bỏ qua; 1536 test đạt, 7 bỏ qua | **105/105 suite, 793/793 test đạt** |
| 2 (sau sửa review) | `449972f` | 0 lỗi | 0 vòng | 0 lỗi, 7 cảnh báo | **chưa hoàn tất** | **chưa hoàn tất** |

Lượt 2 bị dừng giữa chừng vì máy hết bộ nhớ (lệnh nền bị hệ thống dừng khi phiên rảnh). Tiến trình e2e mồ côi còn sót lại đã được dừng thủ công. **Không chạy lại tự động**; chờ chủ đồ án cho phép.

Kiểm riêng sau sửa review (đã chạy, đều đạt):
- E2E: `multi-problem-p1b-grading-guard`, `-attach-guard`, `-manual`, `-authoring`, `-students`, `-canary`, `exam-authoring-attach`: **37/37**.
- Unit: `student-total.spec`, `student-total-state.spec`: **12/12**.

### 2.2 Diễn tập một câu trên Railway (Task 11 Step 2): **CHƯA CHẠY**

Cần: M3 đã áp lên Supabase, nhánh đã được triển khai, và sandbox sẵn sàng. Đều là tác động ra ngoài worktree; chờ chủ đồ án.

### 2.3 Kịch bản ba câu (Task 11 Step 3): **CHƯA VIẾT, CHƯA CHẠY**

Tên kịch bản chưa chốt. Chờ chủ đồ án xác nhận cách đặt đề và bộ bài mẫu.

## 3. Review cuối (fresh reviewer, opus) — trạng thái từng mục

Lượt review: `code-reviewer`, phạm vi `4301be1..2f69229`. Mọi mục đã được đối chiếu với code trước khi sửa.

| Mục | Mức | Nội dung | Trạng thái |
|---|---|---|---|
| C1 | Critical | Chấm chưa định tuyến bài theo câu: mọi kết quả mới gắn câu mặc định, chạy gói test của câu 1 | **Một phần.** `start-grading` từ chối phiên nhiều câu (409, `449972f`). Định tuyến thật theo câu **chưa làm** (mục 5.2) |
| I1 | Important | Gắn đề ghi đè đáp án trên kho trước khi bị 409 | **Đã sửa** (`449972f`, kiểm trước khi ghi) |
| I2 | Important | Bỏ câu giữa chừng làm tổng kẹt ở "tạm" | **Đã sửa** (`449972f`, dùng số thứ tự thực tế) |
| I3 | Important | D1 làm đề mặc định nhiều câu (vd. 10/3 điểm) bị 400 | **Chưa sửa.** Hệ quả của D1 đã duyệt; cần quyết định (mục 5.1) |
| I4 | Important | Không có đường sửa nội dung một câu sau khi gắn; màn hình đề cương (D4 Đợt A) chưa làm | **Chưa sửa.** Chưa có web (mục 5.4) |
| I5 | Important | Đáp án Soạn đề qua sandbox được gán thước `teacher`; spec §6.3b coi chỉ model viết là `unverified` | **Chưa sửa.** Mâu thuẫn spec, cần quyết định (mục 5.3) |
| M1 | Minor | `approve` trả `approvedAt`/`id` undefined (TypeORM trả `[rows, rowCount]` cho UPDATE). **Có từ trước nhánh** | Chưa sửa |
| M2 | Minor | Hai bài cho một câu, một bài chờ kiểm mẫu: tổng hiện "tạm" thay vì "—" | **Đã sửa** (`449972f`). Lưu ý: test chưa được quan sát đỏ trước sửa (cùng một lần sửa đổi chữ ký) |
| M3 | Minor | Ô tổng xuất có `computationId` null: dòng xuất không mang `score_computation_id` | Chưa sửa |
| M4 | Minor | Canary: Câu 1 còn `ai_grading`, nên kiểm tra xuất không phân biệt được "—" với "tạm" | Chưa sửa |
| M5 | Minor | Thêm câu vào phiên đã có bài chấm | **Đã sửa** (`449972f`, 409) |

## 4. Việc chưa làm so với plan

- Màn hình đề cương tối thiểu (D4 Đợt A): không có thay đổi `apps/web`.
- Định tuyến bài theo câu và câu-theo-file: chưa có (xem C1).
- Rubric riêng từng câu (spec §3.1): chưa làm, theo D1 đã duyệt.
- Task 11 Steps 2–3 (mục 2.2, 2.3).

## 5. Quyết định cần chủ đồ án

1. **D1 và rubric.** Hiện: mọi câu dùng chung rubric của phiên, điểm mỗi câu bằng tổng tiêu chí. Spec §3.1 ghi rubric riêng từng câu. Chọn: giữ D1 (và nhận hệ quả I3), hay đổi thiết kế rubric theo câu.
2. **Định tuyến câu–file cho C1.** Muốn chấm được phiên nhiều câu, cần khai file nộp cho từng câu (hiện câu 2 trở đi không có `required_deliverable_id`). Chọn cách khai file theo câu, và có làm trong P1b hay hoãn.
3. **I5 — thước do model viết.** Chọn: đáp án Soạn đề luôn `unverified` (không tự quyết), hay giữ D5 hiện tại (chỉ khi model không tự kiểm được).
4. **I4 — sửa nội dung câu sau khi gắn.** Cần đường API/web tối thiểu, hoặc hoãn và chấp nhận phải sửa bằng cách khác.
5. **M3 áp lên Supabase (điều kiện merge).** Entity đã map các cột `blueprint_confirmed_*`; Railway deploy `main` mà không chạy migration. Nếu merge trước khi M3 có trên Supabase, mọi truy vấn `ExamSessionEntity` lỗi. Cần phê duyệt áp M3 trước khi merge.
6. **Task 11 Steps 2–3.** Cần phê duyệt chạy diễn tập trên Railway và sandbox, và chọn tên kịch bản ba câu.
7. **Merge.** Chỉ khi các mục 5.1–5.5 đã xong và chủ đồ án duyệt.

## 6. Các quyết định (ruling) đã ghi trong sổ

Đầy đủ trong `progress.md`. Những quyết định đáng chú ý:
- D1 áp đúng chữ; ví dụ (a) của brief (4 và 6 điểm, rubric 10) đã viết lại thành hai câu cùng 5 điểm.
- Đề một câu giữ đường cũ, không kiểm D1.
- Thêm/bỏ câu sau khi xác nhận đề cương: 409.
- Bỏ câu bị chặn khi có bất kỳ kết quả, gói test hay đáp án trỏ tới (ba FK RESTRICT).
- Tổng của sinh viên: `blank` tính là thiếu; hai bài cùng một câu là xung đột.
- Rút mẫu theo MSSV chỉ áp cho quyết định tự duyệt mới; bài đã rút giữ nguyên cờ.
- Canary Task 6 xanh ngay (không có đường rò hiện tại); không kiểm đột biến.

## 7. Ghi chú kỹ thuật

- M2: test `student-total-state.spec` không được quan sát đỏ trước sửa.
- Các ràng buộc chưa kiểm chứng: `FOR UPDATE` với subquery trong guard (chạy xanh); M3 trên Supabase (dữ liệu có thoả khoá ngoại ghép mới không).
- Không dùng `git stash`; không push; không merge.
