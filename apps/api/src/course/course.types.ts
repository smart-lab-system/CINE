export interface CourseView {
  id: string;
  code: string;
  name: string;
  semesterId: string;
  // How many students are enrolled in this course (via Enrollment) —
  // powers the create-exam-session form's non-blocking capacity-vs-
  // enrollment warning once a Room is also selected.
  enrollmentCount: number;
}

/** One student on a class list, as both the import and the readback speak it. */
export interface RosterEntry {
  mssv: string;
  name: string;
}

/**
 * What an import actually did, counted server-side.
 *
 * The browser showed a preview before the user confirmed; these numbers are
 * the database's answer, which is the one worth reporting back. `missing` is
 * present whether or not `removeMissing` was set — naming who is on the list
 * but not in the file is the whole point of reporting it.
 */
export interface RosterImportResult {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  missing: RosterEntry[];
}

/**
 * A class as its own lecturer sees it in the create-session form: enough to
 * pick one and to warn about a room too small, without a second round-trip
 * per row.
 */
export interface TeachingClassView {
  id: string;
  name: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  /** Students on the imported roster — 0 means nobody has imported one yet. */
  studentCount: number;
}

/** Một dòng của file import không nhập được, và vì sao. `row` là 0-based. */
export interface ImportClassRowError {
  row: number;
  reason: string;
}

/**
 * Kết quả import lớp hàng loạt (CLAUDE.md §7.2.1).
 *
 * `errors` không rỗng KHÔNG có nghĩa là cả batch hỏng: các con số phía
 * trên vẫn là những gì đã thực sự ghi vào DB. Xem
 * `ClassImportService.importForHead` cho lý do vì sao ở đây một dòng lỗi
 * không chặn cả file, còn ở import roster thì có.
 */
export interface ImportClassResult {
  coursesCreated: number;
  classesCreated: number;
  classesUpdated: number;
  errors: ImportClassRowError[];
}

/**
 * A class as a Trưởng khoa sees it: what they created, plus how far it has
 * actually got (CLAUDE.md §7.2.5).
 *
 * **Ba con số, không có nội dung nào.** Đây là lần đầu `department_admin`
 * chạm tới tầng Sở hữu (§1.1) — điểm, tên file, tên sinh viên đã nộp đều
 * KHÔNG thuộc về đây. Thêm bất cứ trường nào như vậy vào interface này là
 * đổi ranh giới phân quyền, không phải thêm một cột hiển thị; nội dung là
 * việc của chức năng báo cáo GV→TK trong tương lai.
 */
export interface ClassWithCountsView {
  id: string;
  courseId: string;
  name: string;
  teacherId: string;
  /** Sinh viên trong roster của lớp này. */
  rosterCount: number;
  /** Phiên thi giảng viên đã mở cho lớp này. */
  examSessionCount: number;
  /** Bài đã chấm xong — không tính bài đang chấm hoặc máy vừa chấm xong. */
  gradedCount: number;
}

/**
 * A teacher as a Trưởng khoa sees them — QA-reported gap: "ở trưởng khoa,
 * ko có quản lý giảng viên hiện tại có trong khoa". There is no
 * department/khoa table (see the AddDepartmentHeadAndNameUniqueness
 * migration's own reasoning); a teacher's membership in a department is
 * entirely implicit, derived from being assigned (class.teacher_id) to a
 * class under a course this head owns. Deliberately read-only and
 * name/email/count only — the teacher ACCOUNT itself stays admin's to
 * create/edit/delete (AccountsController is admin-only for that); this is
 * a head's view of who is currently teaching in their department, not a
 * second place to manage accounts.
 */
export interface DepartmentTeacherView {
  id: string;
  name: string;
  email: string;
  /** Classes taught under a course this head owns — never 0, since that
   *  would mean the teacher has no class here at all and so would never
   *  appear in this list in the first place. */
  classCount: number;
}
