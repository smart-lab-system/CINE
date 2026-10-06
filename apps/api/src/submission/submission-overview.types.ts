import type { ExamSessionStatus, ExamType } from '../exam-session/entities/exam-session.entity';

export interface MatchedStudent {
  mssv: string;
  name: string;
}

/**
 * Một dòng của "Quản lý bài thu" — xem
 * docs/superpowers/specs/2026-09-03-submissions-rollup-page-design.md §3.1.
 *
 * Năm field định danh đầu (course/class/examType/startTime/room) tồn tại vì
 * GV phải nhận ra "à, kỳ này" sau nhiều tháng — §1.2.
 */
export interface SessionOverviewItem {
  id: string;
  name: string;
  code: string;
  courseName: string;
  classId: string;
  /** Nhãn gộp của lớp (`DHKTPM18A – Nhóm 1`), đọc từ view `class_label`. */
  classLabel: string | null;
  /**
   * Học kỳ HIỆN TẠI của lớp (khoá), nguồn cho bộ lọc phía trình duyệt. `null` chỉ với lớp cũ chưa backfill.
   * Khác `semesterName` bên dưới: đó là bản chụp lúc tạo phiên.
   */
  semesterId: string | null;
  academicYear: number | null;
  term: number | null;
  roomName: string;
  examType: ExamType;
  startTime: string;
  endTime: string;
  status: ExamSessionStatus;

  /**
   * Rubric đã ghim cho phiên này — `null` nghĩa là chưa chấm được.
   *
   * `null` KHÔNG phải lý do để loại phiên khỏi danh sách: xem spec
   * 2026-09-05-session-pinned-rubric §5.3. Trang Chấm điểm hiện nó ra kèm
   * trạng thái chặn, vì bài thi thật của SV đang nằm trong đó.
   */
  rubricId: string | null;
  rubricVersion: number | null;

  requiredDeliverableCount: number;
  /** |roster ∪ người đã nộp| — §3.2. KHÔNG phải rosterSize. */
  expectedCount: number;
  /** false khi phiên không gắn lớp, hoặc lớp chưa có roster. */
  rosterKnown: boolean;
  fullySubmittedCount: number;
  partialCount: number;

  /**
   * Có ít nhất 1 agent_connection_event cho phiên này, và 0 bài nộp.
   * Mức 🔴: sinh viên có ngồi thi mà không gì về tới — bài có thể đã mất.
   * Đây là ca duy nhất mà lỗi có thể thuộc về hệ thống, không phải sinh viên.
   */
  attendedNoSubmissionCount: number;
  /** Không có event nào và 0 bài nộp. Mức 🟡: vắng thi, việc hành chính. */
  neverAttendedCount: number;

  /**
   * Trong roster phiên này, không có mặt ở đây, nhưng CÓ dấu vết ở một phiên
   * khác **cùng môn và cùng loại kỳ thi** — sinh viên thi bù ở phiên khác.
   *
   * Tách khỏi `neverAttendedCount` vì gọi họ là "vắng thi" vừa sai vừa tốn
   * công: giảng viên đi truy một người đã thi rồi. Đây là thông tin, không
   * phải lỗi.
   *
   * Điều kiện cùng `exam_type` là bắt buộc, không phải cho chặt chẽ: chỉ so
   * môn thôi thì sinh viên dự giữa kỳ rồi bỏ cuối kỳ sẽ bị gắn nhầm là thi
   * bù, và người đáng truy nhất lại thành người được bỏ qua.
   */
  satElsewhereCount: number;

  /** Đếm theo FILE, không theo sinh viên. */
  invalidFileCount: number;

  /**
   * Số bài mà file nén đã về tới nơi nhưng kiểm nội dung bên trong ra
   * `failed` hoặc `unreadable` — spec
   * 2026-09-21-archive-content-validation-design.md §8.3.
   *
   * KHÔNG gộp vào `invalidFileCount`: nó đếm một khái niệm khác (`invalidFileCount`
   * chưa có luồng nào sinh ra — xem submission-attention.ts), và trộn hai
   * thứ vào một số là làm cả hai không đọc được.
   */
  archiveIssueCount: number;

  /**
   * Học kỳ, bản chụp lúc tạo phiên — giữ cho bảng điểm (nó không đổi theo khi ai đó sửa học kỳ về sau).
   * Bộ lọc dùng `semesterId`/`academicYear`/`term` ở trên, không dùng chuỗi này.
   */
  semesterName: string;

  /**
   * Sinh viên khớp từ khoá tìm kiếm, trong phiên này. `null` khi request
   * không mang `student` — không phải mảng rỗng, để "không tìm" và "tìm mà
   * không ra" là hai chuyện khác nhau ở tầng gọi.
   */
  matchedStudents: MatchedStudent[] | null;

  /** ISO, hoặc null. Xem SessionLifecycleService. */
  archivedAt: string | null;
  attentionClosedAt: string | null;
}
