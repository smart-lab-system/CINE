/**
 * "Gần giống" — luật cảnh báo lỗi gõ cho tên phòng và mã lớp danh nghĩa.
 *
 * Hệ thống KHÔNG biết một phòng hay một lớp có thật không; nó chỉ biết đã có gì
 * trong bảng. Cái nó làm được là nói "cái bạn vừa gõ giống cái này", trước khi
 * ghi, để người gõ nhìn lại một lần.
 *
 * Luật (đo trên dữ liệu thật ngày 2026-10-04, ba phòng và hai mã lớp):
 *   1. bằng nhau sau chuẩn hoá — bỏ dấu tiếng Việt, hoa-thường, và mọi ký tự
 *      không phải chữ/số ("P.A101" ~ "P A101" ~ "p-a101");
 *   2. HOẶC hơn kém đúng MỘT ký tự chèn/xoá;
 *   3. HOẶC hai ký tự LIỀN KỀ đổi chỗ.
 * Luật 2 và 3 chỉ áp khi cả hai chuỗi chuẩn hoá dài >= MIN_FUZZY_LENGTH: với
 * chuỗi ngắn một ký tự là cả một phần ba cái tên ("A1" ~ "A12" là hai phòng).
 *
 * KHÔNG tính một ký tự THAY THẾ, và đây là điểm cố ý khác bản spec đầu ("khoảng
 * cách chỉnh sửa <= 2"): `DHKTPM18ATT` / `DHKTPM18CTT` và `Phòng máy A1` /
 * `Phòng máy B1` là các thực thể KHÁC NHAU ở khoảng cách 1. Một cảnh báo bật
 * trên chúng dạy người dùng bấm "xác nhận" cho qua mọi thứ, tức là phá chính
 * cái nó sinh ra để làm. Cái giá: lỗi gõ thay một ký tự ("ATT" -> "ATR") không
 * bị bắt, vì về hình thức nó không phân biệt được với một lớp anh em thật.
 *
 * CHỮ SỐ không bao giờ là một "lỗi gõ" ở luật 2 và 3 (reviewer cụm 1, I1): thêm/bớt một
 * chữ số hay đổi chỗ hai chữ số cho ra một SỐ KHÁC, tức một phòng/mã khác — "Phòng máy 1"
 * ≠ "Phòng máy 10", "Phòng H3.01" ≠ "Phòng H3.10", "422001525812" ≠ "422001525821".
 * Tiền tố dài ("Phòng máy") làm ngưỡng MIN_FUZZY_LENGTH vô tác dụng, nên không loại chữ số
 * thì import cả một tầng phòng đánh số liên tiếp sẽ bật cảnh báo hàng loạt — đúng hiệu ứng
 * "dạy người dùng bấm xác nhận mọi thứ". Cái giá: một chữ số gõ thừa ("A1" -> "A11") không
 * bị bắt; về hình thức nó không phân biệt được với phòng thứ mười một. Đổi chỗ một chữ CÁI
 * với một chữ SỐ ("18A" -> "1A8") vẫn tính là lỗi gõ.
 *
 * Hàm đối xứng: nearDuplicateReason(a, b) === nearDuplicateReason(b, a).
 */

export type NearDuplicateReason = 'normalized' | 'insert_delete' | 'swap';

/** Dưới ngưỡng này chỉ so bằng nhau sau chuẩn hoá. */
const MIN_FUZZY_LENGTH = 5;

export function normalizeForCompare(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const isDigit = (char: string): boolean => char >= '0' && char <= '9';

/**
 * `longer` có đúng một ký tự thừa so với `shorter` (và bỏ nó đi thì ra `shorter`):
 * trả ký tự thừa, hoặc `null` nếu không phải một phép chèn đơn.
 */
function singleInsertion(shorter: string, longer: string): string | null {
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i++;
  return shorter.slice(i) === longer.slice(i + 1) ? longer[i] : null;
}

/**
 * Cùng độ dài, khác nhau đúng ở hai vị trí LIỀN KỀ và hai ký tự đó đổi chỗ cho nhau:
 * trả hai ký tự đó, hoặc `null` nếu không phải một phép đổi chỗ liền kề.
 */
function adjacentSwap(a: string, b: string): [string, string] | null {
  if (a.length !== b.length) return null;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (i >= a.length - 1) return null;
  const swapped = a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  return swapped ? [a[i], a[i + 1]] : null;
}

export function nearDuplicateReason(a: string, b: string): NearDuplicateReason | null {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na === '' || nb === '') return null;
  if (na === nb) return 'normalized';
  if (na.length < MIN_FUZZY_LENGTH || nb.length < MIN_FUZZY_LENGTH) return null;
  if (Math.abs(na.length - nb.length) === 1) {
    const [shorter, longer] = na.length < nb.length ? [na, nb] : [nb, na];
    const extra = singleInsertion(shorter, longer);
    if (extra !== null) return isDigit(extra) ? null : 'insert_delete';
  }
  const swapped = adjacentSwap(na, nb);
  if (swapped) return isDigit(swapped[0]) && isDigit(swapped[1]) ? null : 'swap';
  return null;
}

export interface NearDuplicateMatch<T> {
  candidate: T;
  reason: NearDuplicateReason;
}

/**
 * Các ứng viên gần giống `value`, theo thứ tự đầu vào. Người gọi tự loại trừ
 * (a) bản thân đối tượng đang sửa và (b) các trùng CỨNG (bằng nhau không phân
 * biệt hoa-thường — DB đã có khoá duy nhất citext cho chúng).
 */
export function findNearDuplicates<T>(
  value: string,
  candidates: readonly T[],
  textOf: (candidate: T) => string,
): NearDuplicateMatch<T>[] {
  const matches: NearDuplicateMatch<T>[] = [];
  for (const candidate of candidates) {
    const reason = nearDuplicateReason(value, textOf(candidate));
    if (reason) matches.push({ candidate, reason });
  }
  return matches;
}
