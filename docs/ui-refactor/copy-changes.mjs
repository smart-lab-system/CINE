// WP3: thay chuỗi hiển thị (không đụng logic). Mỗi cặp phải khớp ít nhất một lần; cặp nào không khớp sẽ báo lỗi.
// Chạy từ worktree: node docs/ui-refactor/copy-changes.mjs
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('apps/web/src');

// [file tương đối với src, [cũ, mới], ...]
const EDITS = [
  ['app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable.tsx', ['Có khi module chấm điểm hoàn thiện', 'Chưa có điểm']],
  ['app/admin/master-data/rooms/page.tsx', ['Xem và duyệt đề xuất từ Teacher Hub bên dưới.', 'Xem và duyệt đề xuất của giảng viên ở phần bên dưới.']],
  ['app/admin/master-data/rooms/room-proposals-panel.tsx', ['Giảng viên gửi từ Teacher Hub - kèm máy GV và máy SV trong registry.', 'Giảng viên gửi đề xuất từ tài khoản của họ, kèm máy của giảng viên và máy của sinh viên.']],
  ['app/teacher/exam-bank/page.tsx', ['Kho đề theo catalog môn. Bạn cần được admin phân công lớp có gắn môn học (course_id).', 'Kho đề theo môn học. Bạn cần được quản trị viên phân công một lớp thuộc môn học này để tạo đề.']],
  ['app/teacher/grading/[resultId]/page.tsx', ["'Mức 2 - có đề bài'", "'Có đề bài'"], ["'Mức 1 - chỉ có thang chấm'", "'Chỉ có thang chấm'"], ['Bài code này chấm bằng đọc mã, không chạy: không có độ phủ hay bằng chứng lời gọi công cụ.', 'Bài code này được chấm bằng cách đọc mã, không chạy thử: không có kết quả chạy thử hay bằng chứng tự động.']],
  ['app/teacher/grading/[resultId]/_components/AdvocatePanel.tsx', ['Các trích dẫn chưa đối chiếu.', 'Các trích dẫn chưa được kiểm tra lại với bài làm.'], ['Đã đối chiếu ${opinion.evidence.length} trích dẫn', 'Đã kiểm tra ${opinion.evidence.length} trích dẫn'], ['Phiên này chưa nạp đề bài nên lượt phản biện không chạy. Không có ai lên tiếng cho bài làm đúng theo một cách khác.', 'Phiên này chưa có đề bài nên phần phản biện không chạy.']],
  ['app/teacher/grading/[resultId]/_components/CriterionCard.tsx', ["label: 'chưa đối chiếu'", "label: 'chưa kiểm tra lại'"], ['Đo bằng cách đối chiếu trích dẫn với bài làm', 'Đo bằng cách kiểm tra trích dẫn có trong bài làm']],
  ['app/teacher/grading/[resultId]/_components/investigator/ErrorEvidence.tsx', ["ran: 'Chưa có đáp án để đối chiếu'", "ran: 'Chưa có đáp án để so sánh'"], ['Đã đối chiếu: đoạn này đúng là có trong bài.', 'Đã kiểm tra: đoạn này đúng là có trong bài.'], ['Chưa đối chiếu được: không tìm thấy đoạn này trong bài, nên không dùng làm bằng chứng.', 'Không tìm thấy đoạn này trong bài, nên không dùng làm bằng chứng.']],
  ['app/teacher/grading/[resultId]/_components/investigator/CoverageSection.tsx', ['Độ phủ điều tra', 'Mức kiểm tra bài'], ['Độ phức tạp đo được', 'Độ phức tạp đo được'], ['Cần công cụ đo độ phức tạp (bước 4 của spec chấm điểm) - chưa xây. Bài nộp chưa được so với đề theo lớp thời', 'Chưa có số đo độ phức tạp cho bài này. Bài nộp chưa được so với đề theo thời'], ['Chạy lại ngẫu nhiên lời gọi #', 'Chạy lại ngẫu nhiên lượt kiểm tra #'], ['chưa chạy lại được để đối', 'chưa chạy lại được để so sánh']],
  ['app/teacher/grading/_components/PreparePanel.tsx', ['vào hàng đợi chấm', 'vào danh sách chờ chấm']],
  ['app/teacher/grading/_components/session-list/BulkDialog.tsx', ['vào hàng đợi chấm', 'vào danh sách chờ chấm']],
  ['app/teacher/submissions/[sessionId]/page.tsx', ['vào hàng đợi kiểm file nén.', 'vào danh sách chờ kiểm tra file nén.']],
  ['app/teacher/grading/_components/ReapplyPricesPanel.tsx', ['Áp giá mới', 'Cập nhật mức trừ']],
  ['app/teacher/grading/_components/RunningPanel.tsx', ['<strong>{stuckCount} bài không còn ai chấm</strong> - hàng đợi không còn việc nào cho chúng.', '<strong>{stuckCount} bài đang bị kẹt</strong> - không còn tiến trình chấm nào xử lý chúng.'], ['Tiến độ đã đứng yên {describeStall(stall)}.', 'Không có bài nào hoàn thành trong {describeStall(stall)}.'], ['Chấm tiếp {stuckCount} bài treo', 'Chấm lại {stuckCount} bài bị kẹt']],
  ['app/teacher/rubrics/page.tsx', ['title="Question Specific"', 'title="Rubric theo câu hỏi"'], ['Tạo rubric Question Specific từ Kho đề', 'Tạo rubric theo câu hỏi từ Kho đề']],
  ['app/teacher/rubrics/[id]/page.tsx', ['Rubric này không phải Question Specific. Xem cấu trúc QA ở Bảng lỗi.', 'Rubric này không phải rubric theo câu hỏi. Xem cấu trúc chung ở Bảng lỗi.'], ['Chi tiết rubric Question Specific - thông tin', 'Chi tiết rubric theo câu hỏi - thông tin']],
  ['lib/nav-config.ts', ["label: 'Question Agnostic'", "label: 'Rubric chung'"], ["label: 'Question Specific'", "label: 'Rubric theo câu hỏi'"]],
  ['components/status-pill.tsx', ["'Tự duyệt theo chính sách cũ'", "'Đã chốt theo quy tắc cũ'"]],
  ['lib/session-triage.ts', ["auto: 'Tự quyết'", "auto: 'AI tự chốt'"]],
  ['lib/grading-vocab.ts', ['Bị chặn - trùng lời gọi trước', 'Bị chặn - trùng lượt kiểm tra trước'], ['Chạy lại để đối chiếu ra kết quả khác', 'Chạy lại cho kết quả khác'], ['Chưa chạy lại để đối chiếu được', 'Chưa chạy lại được để so sánh'], ['Bằng chứng không khớp lời gọi thật', 'Bằng chứng không khớp lượt kiểm tra thật']],
  ['app/teacher/grading/[resultId]/_components/investigator/UngradableView.tsx', ['{touchedCalls} lời gọi', '{touchedCalls} lượt kiểm tra'], ['Chưa có lời gọi nào được ghi lại.', 'Chưa có lượt kiểm tra nào được ghi lại.']],
];

let failed = 0;
for (const [rel, ...pairs] of EDITS) {
  const file = path.join(SRC, rel);
  if (!fs.existsSync(file)) { console.log('MISSING FILE', rel); failed++; continue; }
  let text = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    const count = text.split(from).length - 1;
    if (count === 0) { console.log('NO MATCH', rel, '::', from.slice(0, 70)); failed++; continue; }
    text = text.split(from).join(to);
  }
  fs.writeFileSync(file, text);
}
console.log(failed === 0 ? 'ALL PAIRS APPLIED' : `${failed} pair(s) did not match`);
