import { COURSE_NAME } from '../../src/common/course-name';
import { concurrentLiveWindow } from './session-window';
import { ensureTestSemester } from './master-data';

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

/**
 * Phòng theo tên, tạo nếu chưa có (không phân biệt hoa-thường). Idempotent: hai lần gọi cùng tên trả cùng một phòng, nên
 * các test cần "hai phiên cùng phòng" chỉ việc truyền cùng một `roomName`.
 */
export async function ensureRoom(db: Queryable, name: string): Promise<{ id: string; name: string }> {
  const [row] = await db.query(
    `INSERT INTO examcollect.room (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = examcollect.room.name
     RETURNING id, name::text AS name`,
    [name],
  );
  return { id: row.id as string, name: row.name as string };
}

/** Lớp danh nghĩa theo mã (HOA, 3–30 chữ/số), tạo nếu chưa có. */
async function ensureAdministrativeClass(db: Queryable, code: string): Promise<string> {
  if (!/^[A-Z0-9]{3,30}$/.test(code)) {
    throw new Error(`seedClass: code "${code}" phải là chữ HOA/số dài 3–30 ký tự (khớp ck_administrative_class_code).`);
  }
  const [row] = await db.query(
    `INSERT INTO examcollect.administrative_class (code) VALUES ($1)
     ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
     RETURNING id`,
    [code],
  );
  return row.id as string;
}

export interface SeedClassOptions {
  teacherId: string;
  /** Mã lớp danh nghĩa (HOA, 3–30 chữ/số). Mặc định: một mã duy nhất tự sinh (`ADM…`). Bị bỏ qua khi có `administrativeClassId`. */
  code?: string;
  /** Nhóm, vd "Nhóm 1". Mặc định `''` = không tách nhóm. */
  groupName?: string;
  /** Chỉ truyền khi test CỐ Ý cần một môn khác. Mặc định là hằng số của hệ thống. */
  courseName?: string;
  /** Học kỳ của lớp. Mặc định: học kỳ test dùng chung (2200, kỳ 1). `null` = lớp CŨ chưa có học kỳ (dữ liệu trước backfill). */
  semesterId?: string | null;
  /** Lớp danh nghĩa có sẵn. Mặc định: tạo/dùng lớp theo `code`. `null` = lớp cũ chưa gán. */
  administrativeClassId?: string | null;
}

export interface SeededClass {
  id: string;
  code: string;
  groupName: string;
  /** Nhãn hiển thị — đọc từ view `class_label`, đúng thứ mà API trả ra ở mọi nơi hiện tên lớp. */
  label: string;
  semesterId: string | null;
  administrativeClassId: string | null;
}

export async function seedClass(db: Queryable, o: SeedClassOptions): Promise<SeededClass> {
  const groupName = o.groupName ?? '';
  const semesterId = o.semesterId === undefined ? await ensureTestSemester(db, 1) : o.semesterId;
  const administrativeClassId =
    o.administrativeClassId === undefined
      ? await ensureAdministrativeClass(db, o.code ?? `ADM${stamp()}`)
      : o.administrativeClassId;
  // KHÔNG ghi `class.name` (cột cũ, bị gỡ ở plan H): tên lớp là biểu thức của mã + nhóm.
  const [row] = await db.query(
    `INSERT INTO examcollect.class
       (course_name, teacher_id, semester_id, administrative_class_id, group_name)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [o.courseName ?? COURSE_NAME, o.teacherId, semesterId, administrativeClassId, groupName],
  );
  const [meta] = await db.query(
    `SELECT cl.label, ac.code::text AS code
       FROM examcollect.class_label cl
       JOIN examcollect.class c ON c.id = cl.class_id
       LEFT JOIN examcollect.administrative_class ac ON ac.id = c.administrative_class_id
      WHERE cl.class_id = $1`,
    [row.id],
  );
  return {
    id: row.id as string,
    code: (meta.code as string | null) ?? '',
    groupName,
    label: meta.label as string,
    semesterId,
    administrativeClassId,
  };
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
  await db.query(
    `INSERT INTO examcollect.enrollment (student_mssv, home_class_id, home_teacher_id)
     VALUES ($1, $2, $3)`,
    [o.mssv, o.classId, o.teacherId],
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
  /**
   * Phòng thật. Mặc định: tạo/dùng phòng theo `roomName` (hoặc một tên duy nhất) và ghi `room_id`. `roomId` có sẵn
   * thì `roomName` mặc định là tên của phòng đó.
   */
  roomId?: string;
  /** Dòng KIỂU CŨ chỉ có bản chụp tên phòng, `room_id` NULL — cho test về ràng buộc cũ ở giai đoạn chuyển tiếp. */
  withoutRoom?: boolean;
}

export interface SeededExamSession {
  id: string;
  code: string;
  roomId: string | null;
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
export async function seedExamSession(db: Queryable, o: SeedExamSessionOptions): Promise<SeededExamSession> {
  const s = stamp();
  const code = (o.code ?? `S${s}`).slice(0, 20);
  const semesterName = o.semesterName ?? 'HK kiểm thử';
  const courseName = o.courseName ?? COURSE_NAME;

  let roomId: string | null = null;
  let roomName = o.roomName ?? `P ${s}`;
  if (!o.withoutRoom) {
    if (o.roomId) {
      roomId = o.roomId;
      if (o.roomName === undefined) {
        const [room] = await db.query(`SELECT name::text AS name FROM examcollect.room WHERE id = $1`, [o.roomId]);
        roomName = room.name as string;
      }
    } else {
      const room = await ensureRoom(db, roomName);
      roomId = room.id;
      roomName = room.name;
    }
  }

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
      roomId,
    ],
  );
  return { id: row.id as string, code, roomId, roomName, semesterName, courseName };
}

export interface SessionBodyOptions {
  classId: string;
  name?: string;
  /** Phòng có sẵn. Loại trừ nhau với `roomName`. */
  roomId?: string;
  /** Tên phòng: tạo/dùng phòng theo tên rồi gửi `roomId` của nó. Mặc định một tên duy nhất. */
  roomName?: string;
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
 * Thân hợp lệ của `POST /exam-sessions` — `roomId`, KHÔNG có `roomName`/`semesterName`: phòng do giảng viên CHỌN, học kỳ
 * suy ra từ lớp (spec §2.4). Nhận `roomName` cho tiện test: tạo phòng theo tên (idempotent) rồi gửi id của nó.
 */
export async function sessionBody(db: Queryable, o: SessionBodyOptions): Promise<Record<string, unknown>> {
  if ((o.startTime === undefined) !== (o.endTime === undefined)) {
    throw new Error('sessionBody: phải truyền cả startTime và endTime, hoặc không truyền cái nào.');
  }
  if (o.roomId !== undefined && o.roomName !== undefined) {
    throw new Error('sessionBody: truyền roomId HOẶC roomName, không cả hai.');
  }
  const window =
    o.startTime !== undefined && o.endTime !== undefined
      ? { startTime: o.startTime, endTime: o.endTime }
      : concurrentLiveWindow();
  const s = stamp();
  const roomId = o.roomId ?? (await ensureRoom(db, o.roomName ?? `P ${s}`)).id;
  return {
    name: o.name ?? `Phiên ${s}`,
    classId: o.classId,
    roomId,
    examType: o.examType ?? 'TK',
    ...window,
    requiredFilenames: o.requiredFilenames ?? ['Cau1.docx'],
    ...(o.rubricId ? { rubricId: o.rubricId } : {}),
  };
}
