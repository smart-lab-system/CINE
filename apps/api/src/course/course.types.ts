import type { RenamedStudent } from './student.service';

// Một khai báo duy nhất, ở `student.service.ts`; re-export để người dùng kiểu này không phải biết nó nằm đâu.
export type { RenamedStudent };

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
 *
 * `updated` đếm dòng danh sách ĐÃ CÓ mà có gì đó đổi (giảng viên của lớp, hoặc tên sinh
 * viên bị file đổi); `renamed` liệt kê MỌI sinh viên trong file bị đổi tên — kể cả em vừa vào
 * lớp này nhưng đã có tên khác ở lớp khác. Chỉ có MỘT tên cho một sinh viên, nên đổi tên ở đây
 * áp dụng cho mọi lớp (spec §2.6, §12 mục 3): giảng viên phải thấy ai bị đổi.
 */
export interface RosterImportResult {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  missing: RosterEntry[];
  renamed: RenamedStudent[];
}

/**
 * Một lớp như CHÍNH giảng viên của nó thấy: đủ để chọn trong form tạo phiên (nhãn gộp kèm học kỳ) và
 * để cảnh báo phòng nhỏ (`studentCount`), không cần thêm một lượt gọi mỗi dòng. Giảng viên chỉ thấy MỘT nhãn —
 * không có trang, route hay bộ lọc riêng cho lớp danh nghĩa (spec §2.2, §5.2).
 *
 * `studentCount = 0` có nghĩa riêng chứ không phải rỗng: chưa ai nhập danh sách cho lớp đó.
 */
export class TeachingClassView {
  id!: string;
  /** `DHKTPM18A` hoặc `DHKTPM18A – Nhóm 1`. */
  label!: string;
  /** `label` kèm ` · HK1 2026-2027`, để phân biệt hai lớp cùng nhãn ở hai kỳ. */
  labelWithSemester!: string;
  /** Hằng số của hệ thống (một môn). Giữ vì API vẫn trả; không màn hình nào hiện nó như một cột. */
  courseName!: string;
  /** Luôn có giá trị (NOT NULL từ migration thu hẹp); kiểu giữ `| null` để hợp đồng API/OpenAPI không đổi. */
  semesterId!: string | null;
  academicYear!: number | null;
  term!: number | null;
  studentCount!: number;
}

/** Một lớp như admin thấy trong trang Lớp. */
export class ClassAdminView {
  id!: string;
  label!: string;
  labelWithSemester!: string;
  semesterId!: string | null;
  academicYear!: number | null;
  term!: number | null;
  administrativeClassId!: string | null;
  administrativeClassCode!: string | null;
  groupName!: string;
  teacherId!: string;
  teacherName!: string;
  studentCount!: number;
  sessionCount!: number;
}

/** Một học kỳ như admin và giảng viên đọc nó. `classCount` chỉ có với admin. */
export class SemesterView {
  id!: string;
  academicYearStart!: number;
  term!: number;
  /** `HK1 2026-2027`, suy từ (năm, kỳ). */
  label!: string;
  /** `yyyy-mm-dd`. */
  startDate!: string;
  endDate!: string;
  classCount?: number;
}

/** Một phòng thi. `sessionCount` chỉ có với admin. */
export class RoomView {
  id!: string;
  name!: string;
  capacity!: number | null;
  isActive!: boolean;
  sessionCount?: number;
}

/** Một mã trong Danh mục lớp danh nghĩa (chỉ admin thấy). */
export class AdministrativeClassView {
  id!: string;
  code!: string;
  /** Số lớp học phần đang dùng mã này. */
  classCount!: number;
}
