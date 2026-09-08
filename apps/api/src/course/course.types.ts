/**
 * Một môn như Phòng Đào tạo thấy trong danh mục cấp trường.
 *
 * `departmentHeadName` là lý do view này tồn tại: một cột `departmentHeadId`
 * dạng uuid không nói được cho ai đọc màn hình biết môn đang thuộc khoa nào,
 * và bắt trang tự tra 1 tài khoản / 1 dòng là N+1 trên đúng màn hình có nhiều
 * dòng nhất.
 *
 * `null` ở cả hai trường nghĩa là CHƯA CÓ CHỦ — không phải "thuộc mọi người".
 * Một môn chưa có chủ không hiện trong màn hình của bất kỳ Trưởng khoa nào.
 */
export interface CourseCatalogView {
  id: string;
  code: string;
  name: string;
  semesterId: string;
  departmentHeadId: string | null;
  departmentHeadName: string | null;
  /** Sinh viên đã đăng ký (qua Enrollment) — Phòng Đào tạo cần nó để biết một
   *  môn đã có người học trước khi phân công hay xoá. */
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

  /**
   * Học kỳ của môn. Đây là thứ DUY NHẤT phân biệt "N01" của HK1 với "N01" của
   * HK2: `uq_class_course_name` chỉ unique trên (course_id, name), nên hai kỳ
   * cùng có lớp trùng tên là bình thường, và trên màn hình chúng giống hệt nhau
   * nếu không có trường này.
   */
  semesterId: string;
  semesterName: string;
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
