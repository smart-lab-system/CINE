import { COURSE_NAME } from '../../src/common/course-name';
import { concurrentLiveWindow } from './session-window';

/**
 * Nơi DUY NHẤT trong `test/` được viết `INSERT INTO examcollect.class`,
 * `enrollment` hay `exam_session`, và nơi DUY NHẤT dựng thân của
 * `POST /exam-sessions`.
 *
 * Vì sao có file này: các bộ e2e dựng lớp, sinh viên và phiên thi bằng SQL
 * thô, và SQL thô hỏng lúc CHẠY chứ không lúc biên dịch. Đợt khôi phục master
 * data đổi cả ba bảng (xem spec 2026-10-04 §10 bước 1); nếu 39 file mỗi file
 * tự viết SQL của mình thì mỗi lần đổi schema là 39 chỗ phải sửa và 39 cơ hội
 * để một test xanh vì sai lý do. Gom về đây thì chỉ file này đổi.
 *
 * Từ vựng ở đây là của schema ĐÍCH: một lớp có `code` (mã lớp danh nghĩa) và
 * `groupName`, và nhãn hiển thị là `code – groupName`. Hôm nay hai thứ ấy được
 * ghép lại và ghi vào cột `class.name`; sau plan D chúng đi vào
 * `administrative_class` và `class.group_name`. Test chỉ nói chuyện bằng
 * `code`/`groupName`/`label`, nên không phải biết bên dưới là cột nào.
 */

/** Bất kỳ thứ gì có `.query(sql, params)`: DataSource, EntityManager, QueryRunner. */
export interface Queryable {
  // `any` có chủ đích: kết quả của `DataSource.query` là `any`, và các test
  // hiện có đều giải cấu trúc nó (`const [row] = await ds.query(...)`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, params?: unknown[]): Promise<any>;
}

let counter = 0;

/**
 * Chuỗi duy nhất giữa các lần chạy và trong cùng một lần chạy: thời gian (base36)
 * cộng một bộ đếm của module. HOA để dùng thẳng làm mã lớp.
 */
function stamp(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`.toUpperCase();
}

/** Nhãn hiển thị của một lớp: `DHKTPM18A` hoặc `DHKTPM18A – Nhóm 1`. */
export function classLabel(code: string, groupName: string): string {
  return groupName ? `${code} – ${groupName}` : code;
}

export interface SeedClassOptions {
  teacherId: string;
  /** Mã lớp danh nghĩa. Mặc định: một mã duy nhất tự sinh (`ADM…`). */
  code?: string;
  /** Nhóm, vd "Nhóm 1". Mặc định `''` = không tách nhóm. */
  groupName?: string;
  /**
   * Chỉ truyền khi test CỐ Ý cần một môn khác (vd kiểm phép "cùng môn").
   * Mặc định là hằng số của hệ thống.
   */
  courseName?: string;
  /** Học kỳ của lớp (hàng trong `semester`). Mặc định NULL — chỉ test về dữ liệu nền cần nó. */
  semesterId?: string;
  /** Lớp danh nghĩa (hàng trong `administrative_class`). Mặc định NULL. */
  administrativeClassId?: string;
}

export interface SeededClass {
  id: string;
  code: string;
  groupName: string;
  /** Nhãn hiển thị — thứ mà API trả ra ở mọi nơi hiện tên lớp. */
  label: string;
}

export async function seedClass(db: Queryable, o: SeedClassOptions): Promise<SeededClass> {
  const code = o.code ?? `ADM${stamp()}`;
  const groupName = o.groupName ?? '';
  const label = classLabel(code, groupName);
  const [row] = await db.query(
    `INSERT INTO examcollect.class
       (course_name, name, teacher_id, semester_id, administrative_class_id, group_name)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [o.courseName ?? COURSE_NAME, label, o.teacherId, o.semesterId ?? null, o.administrativeClassId ?? null, groupName],
  );
  return { id: row.id as string, code, groupName, label };
}

export interface SeedEnrollmentOptions {
  classId: string;
  /** Chủ lớp: `enrollment.home_teacher_id` luôn là giảng viên của lớp. */
  teacherId: string;
  mssv: string;
  /** Mặc định `Sinh viên <mssv>`. Ghi vào `student` (tên ở MỘT chỗ). */
  name?: string;
  /**
   * Chỉ cho test về GIAI ĐOẠN CHUYỂN TIẾP: dựng một dòng ở hình dạng TRƯỚC backfill — có
   * `enrollment.student_name`, KHÔNG có hàng trong `student`. Có cờ này thì `name` bị bỏ qua.
   */
  legacyName?: string;
}

export async function seedEnrollment(db: Queryable, o: SeedEnrollmentOptions): Promise<void> {
  if (o.legacyName !== undefined) {
    await db.query(
      `INSERT INTO examcollect.enrollment (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [o.mssv, o.legacyName, o.classId, o.teacherId],
    );
    return;
  }
  const name = o.name ?? `Sinh viên ${o.mssv}`;
  // Tên sinh viên ở MỘT chỗ: upsert, người ghi sau thắng — giống "file thắng" của import danh sách.
  // Hệ quả cho test: hai lần seed cùng MỘT MSSV với HAI tên khác nhau chỉ còn tên sau.
  await db.query(
    `INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, $2)
     ON CONFLICT (mssv) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()`,
    [o.mssv, name],
  );
  // TẠM ghi kép: cột cũ còn được đọc ở những nơi chưa chuyển (Task 3 Step 4–7). Task 7 bỏ nửa này.
  await db.query(
    `INSERT INTO examcollect.enrollment (student_mssv, student_name, home_class_id, home_teacher_id)
     VALUES ($1, $2, $3, $4)`,
    [o.mssv, name, o.classId, o.teacherId],
  );
}

type SessionStatus = 'draft' | 'scheduled' | 'active' | 'collecting' | 'completed' | 'cancelled';
type ExamType = 'TK' | 'GK' | 'CK';

export interface SeedExamSessionOptions {
  teacherId: string;
  classId: string;
  startTime: Date;
  endTime: Date;
  name?: string;
  /** Tối đa 20 ký tự, HOA/số. Mặc định tự sinh. */
  code?: string;
  examType?: ExamType;
  /** Mặc định `active`, như `ExamSessionService.create`. */
  status?: SessionStatus;
  roomName?: string;
  /** Mặc định `HK kiểm thử` — giá trị mà 57/70 chỗ dùng trong e2e. */
  semesterName?: string;
  courseName?: string;
  /** Phòng thật (hàng trong `room`). Mặc định NULL: phiên "kiểu cũ" chỉ có bản chụp tên phòng. */
  roomId?: string;
}

export interface SeededExamSession {
  id: string;
  code: string;
  roomName: string;
  semesterName: string;
  courseName: string;
}

/**
 * Chèn thẳng một phiên thi, BỎ QUA service. Dùng cho test cần một trạng thái
 * mà service không tạo được (`collecting` quá hạn, `completed` trong quá
 * khứ) hoặc cần chứng minh một luật là tính chất của DỮ LIỆU chứ không của
 * một đường code (`exam-schedule-conflict`).
 */
export async function seedExamSession(
  db: Queryable,
  o: SeedExamSessionOptions,
): Promise<SeededExamSession> {
  const s = stamp();
  const code = (o.code ?? `S${s}`).slice(0, 20);
  const roomName = o.roomName ?? `P ${s}`;
  const semesterName = o.semesterName ?? 'HK kiểm thử';
  const courseName = o.courseName ?? COURSE_NAME;
  const [row] = await db.query(
    `INSERT INTO examcollect.exam_session
       (name, code, class_id, teacher_id, exam_type, start_time, end_time, status,
        semester_name, course_name, room_name, room_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      o.name ?? `Phiên ${s}`,
      code,
      o.classId,
      o.teacherId,
      o.examType ?? 'TK',
      o.startTime.toISOString(),
      o.endTime.toISOString(),
      o.status ?? 'active',
      semesterName,
      courseName,
      roomName,
      o.roomId ?? null,
    ],
  );
  return { id: row.id as string, code, roomName, semesterName, courseName };
}

export interface SessionBodyOptions {
  classId: string;
  name?: string;
  roomName?: string;
  semesterName?: string;
  rubricId?: string;
  examType?: ExamType;
  /** Truyền CẢ HAI hoặc không truyền cái nào. */
  startTime?: string;
  endTime?: string;
  requiredFilenames?: Array<
    | string
    | { filename: string; deliverableType?: string; language?: string; entries?: string[] }
  >;
}

/**
 * Thân hợp lệ của `POST /exam-sessions`.
 *
 * `async` và nhận `db` dù hôm nay không cần: sau plan D, phòng là một hàng
 * (`roomId`) nên hàm này sẽ phải tạo/tra phòng theo `roomName`, và `semesterName`
 * sẽ biến khỏi thân. Chữ ký cố định từ bây giờ để 29 file gọi không đổi theo.
 */
export async function sessionBody(
  _db: Queryable,
  o: SessionBodyOptions,
): Promise<Record<string, unknown>> {
  if ((o.startTime === undefined) !== (o.endTime === undefined)) {
    // Ghép một đầu do test chọn với một đầu mặc định là cách tạo ra một khung
    // giờ âm hoặc quá ngắn mà không ai nhận ra mình đã chọn nó.
    throw new Error('sessionBody: phải truyền cả startTime và endTime, hoặc không truyền cái nào.');
  }
  const window =
    o.startTime !== undefined && o.endTime !== undefined
      ? { startTime: o.startTime, endTime: o.endTime }
      : concurrentLiveWindow();
  const s = stamp();
  return {
    name: o.name ?? `Phiên ${s}`,
    classId: o.classId,
    roomName: o.roomName ?? `P ${s}`,
    semesterName: o.semesterName ?? 'HK kiểm thử',
    examType: o.examType ?? 'TK',
    ...window,
    requiredFilenames: o.requiredFilenames ?? ['Cau1.docx'],
    ...(o.rubricId ? { rubricId: o.rubricId } : {}),
  };
}
