/**
 * Số kiểu Việt Nam (§2.1 luật 6 của spec UI): dấu phẩy thập phân, dấu trừ
 * Unicode U+2212 (không phải dấu gạch ngang ASCII), 2 chữ số lẻ rồi bỏ số 0
 * cuối nếu tròn — "4,0" chứ không "4,00", nhưng "7,25" giữ nguyên.
 */
const VN_MINUS = '−';

export function formatVnPoints(value: number | null): string {
  if (value === null) return '—';
  const sign = value < 0 ? VN_MINUS : '';
  const comma = Math.abs(value).toFixed(2).replace('.', ',');
  return sign + comma.replace(/(,\d)0$/, '$1');
}

export function formatVnHundredths(hundredths: number | null): string {
  return formatVnPoints(hundredths === null ? null : hundredths / 100);
}

/** Mức trừ của một luật — luôn hiện dạng âm, kể cả khi giá trị lưu là số dương. */
export function formatVnDeduction(hundredths: number): string {
  return formatVnPoints(-Math.abs(hundredths) / 100);
}
