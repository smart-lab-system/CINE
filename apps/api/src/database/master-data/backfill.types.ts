import type { ParsedSemester } from './semester-name';

/**
 * Ảnh chụp dữ liệu CŨ mà backfill cần — một lần đọc, rồi mọi quyết định là hàm thuần của nó (nên test được không cần DB, và "dừng thay vì đoán"
 * là một thuộc tính của `planBackfill`, không của SQL).
 */
export interface LegacyClass {
  id: string;
  teacherId: string;
  /** Cột cũ `class.name` (đã nới NULL ở migration mở rộng). `null` chỉ với lớp tạo bởi code mới — lớp đó đã có mã danh nghĩa. */
  name: string | null;
  semesterId: string | null;
  administrativeClassId: string | null;
  groupName: string;
}

export interface LegacySession {
  id: string;
  classId: string;
  /** Bản chụp học kỳ do giảng viên gõ. */
  semesterName: string;
  roomName: string;
  roomId: string | null;
}

export interface LegacyEnrollment {
  homeClassId: string;
  studentMssv: string;
  /** Cột cũ `enrollment.student_name` (đã nới NULL). */
  studentName: string | null;
}

export interface LegacySnapshot {
  classes: LegacyClass[];
  sessions: LegacySession[];
  enrollments: LegacyEnrollment[];
  semesters: Array<{ id: string; academicYearStart: number; term: number }>;
  rooms: Array<{ id: string; name: string }>;
  administrativeClasses: Array<{ id: string; code: string }>;
  students: Array<{ mssv: string }>;
}

export interface BackfillOptions {
  /** Học kỳ cho lớp KHÔNG có phiên nào để suy — một GIẢ ĐỊNH, cần admin xác nhận (spec §8.2). Không có mà cần tới thì dừng. */
  defaultSemester?: ParsedSemester;
  /** Lớp đặt theo tên môn cũ gộp vào lớp thật, theo `class.name` (spec §8.3). */
  merges?: Array<{ from: string; into: string }>;
  /** Tên các phòng do lần chạy này TẠO MỚI mà phải ngừng hoạt động (vd `TEST-KHONG-PHONG`). Không bao giờ đổi `is_active` của phòng đã có. */
  inactiveRooms?: string[];
  /** CHỈ cho test/diễn tập có phạm vi: giới hạn ảnh chụp ở các lớp này. Vận hành thật không bao giờ truyền. */
  onlyClassIds?: string[];
}

export type BackfillProblemCode =
  | 'MERGE_CLASS_MISSING'
  | 'MERGE_CLASS_AMBIGUOUS'
  | 'MERGE_TEACHER_MISMATCH'
  | 'MERGE_STUDENT_NOT_IN_TARGET'
  | 'MERGE_CHAIN'
  | 'CLASS_SEMESTER_UNKNOWN'
  | 'CLASS_SEMESTER_CONFLICT'
  | 'CLASS_CODE_UNMAPPABLE'
  | 'CLASS_KEY_COLLISION'
  | 'ROOM_NAME_INVALID'
  | 'STUDENT_MSSV_INVALID'
  | 'STUDENT_NAME_BLANK'
  | 'STUDENT_NAME_CONFLICT';

export interface BackfillProblem {
  code: BackfillProblemCode;
  message: string;
}

export interface BackfillPlan {
  merges: Array<{ fromId: string; intoId: string; fromName: string; intoName: string }>;
  /** Học kỳ cần có (chỉ những cái CHƯA tồn tại). */
  semesters: ParsedSemester[];
  /** Mã lớp danh nghĩa cần có (chỉ những mã CHƯA tồn tại). */
  administrativeClasses: string[];
  classAssignments: Array<{ classId: string; semester?: ParsedSemester; code?: string }>;
  /** Phòng cần tạo (chỉ những phòng CHƯA tồn tại, không phân biệt hoa-thường). */
  rooms: Array<{ name: string; isActive: boolean }>;
  /** Phiên nào gắn vào phòng nào — theo id phiên, nên không lan sang phiên ngoài phạm vi. */
  roomAssignments: Array<{ name: string; sessionIds: string[] }>;
  semesterNameRewrites: Array<{ sessionId: string; label: string }>;
  /** Sinh viên cần thêm (chỉ MSSV CHƯA có trong `student`; không bao giờ ghi đè tên đã lưu). */
  students: Array<{ mssv: string; fullName: string }>;
}
