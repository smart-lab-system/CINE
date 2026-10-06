/**
 * Chuẩn hoá ở tầng GHI cho dữ liệu nền do admin gõ. DB ép lại bằng CHECK
 * (`ck_room_name`, `ck_administrative_class_code`), nhưng DB chỉ TỪ CHỐI: việc
 * biến "dhktpm18a " thành "DHKTPM18A" là của lớp này, để hai cách gõ là một mã.
 */

/** Mã lớp danh nghĩa: chữ HOA và số, 3–30 ký tự. Khớp CHECK ở DB. */
export const ADMINISTRATIVE_CODE_PATTERN = /^[A-Z0-9]{3,30}$/;

const ROOM_NAME_MAX = 100;

export function normalizeRoomName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Chuỗi dạng `Tên(mã)` — cách danh sách của trường hay ghi một lớp, vd `Anh văn 4(422001525805)` — được đọc thành CHÍNH cái mã trong ngoặc cuối.
 * Chỉ khi phần ngoài ngoặc không có ngoặc nào và phần trong ngoặc là một mã hợp lệ (chữ/số, 3–30 ký tự); không thì giữ nguyên chuỗi để
 * `administrativeCodeProblem` báo lỗi thay vì ĐOÁN. Nhập tay và import cùng đi qua hàm này, nên bản xem trước của import hiện mã đã hiểu.
 */
const NAME_WITH_CODE = /^([^()]*)\(\s*([A-Za-z0-9]{3,30})\s*\)\s*$/;

/**
 * Phần NGOÀI ngoặc tự nó đã là một mã lớp (hợp lệ và có chữ số, như `DHKTPM18A`) thì
 * `DHKTPM18A (CLC)` là MƠ HỒ: mã là `DHKTPM18A` hay `CLC`? Không đoán — trả nguyên chuỗi để
 * `administrativeCodeProblem` báo lỗi và người nhập tự bỏ phần ngoặc hoặc phần tên (reviewer
 * cụm 1, I2). Tên không có chữ số (`Toan(422001525805)`) vẫn đọc như thường: một mã lớp thật
 * hầu như luôn có chữ số, còn một cái tên thì không.
 */
function outerLooksLikeCode(outer: string): boolean {
  const candidate = outer.trim().toUpperCase();
  return ADMINISTRATIVE_CODE_PATTERN.test(candidate) && /[0-9]/.test(candidate);
}

export function normalizeAdministrativeCode(raw: string): string {
  const trimmed = raw.trim();
  const match = NAME_WITH_CODE.exec(trimmed);
  if (match && !outerLooksLikeCode(match[1])) return match[2].toUpperCase();
  return trimmed.toUpperCase();
}

export function roomNameProblem(name: string): string | null {
  if (name === '') return 'Tên phòng không được để trống.';
  if (name.length > ROOM_NAME_MAX) return `Tên phòng tối đa ${ROOM_NAME_MAX} ký tự.`;
  return null;
}

export function administrativeCodeProblem(code: string): string | null {
  if (code.length < 3 || code.length > 30) {
    return 'Mã lớp danh nghĩa phải dài 3–30 ký tự.';
  }
  if (!ADMINISTRATIVE_CODE_PATTERN.test(code)) {
    return 'Mã lớp danh nghĩa chỉ gồm chữ và số viết hoa, không có dấu cách hay ký tự đặc biệt.';
  }
  return null;
}

/** Tên nhóm (`Nhóm 1`): tối đa 50 ký tự; rỗng nghĩa là không tách nhóm. Khớp `@Length(0, 50)` ở DTO lớp. */
export const GROUP_NAME_MAX = 50;

export function normalizeGroupName(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}

export function groupNameProblem(name: string): string | null {
  return name.length > GROUP_NAME_MAX ? `Tên nhóm tối đa ${GROUP_NAME_MAX} ký tự.` : null;
}
