/**
 * Cùng một lớp danh nghĩa + nhóm học ở hai học kỳ là hai LỚP (hai `classId`) cùng nhãn — kỳ nào cũng có. Bộ lọc mặc định là "Tất cả học
 * kỳ" nên cả hai cùng hiện, và hai dòng y hệt nhau không cho giảng viên biết cái nào là kỳ nào. Chỉ khi nhãn TRÙNG mới gắn hậu tố (học kỳ)
 * vào: nhãn gọn là mặc định, vì phần lớn danh sách không có hai kỳ của cùng một lớp. Sửa tại chỗ các phần tử do hàm gọi vừa dựng.
 *
 * Dùng chung cho Quản lý bài thu và Chấm điểm: MỘT luật ở MỘT chỗ. Nhận accessor thay vì ép một tên trường (`label`/`classLabel`) để hai nơi
 * có hình dạng dữ liệu khác nhau cùng dùng được.
 */
export function tellApart<T>(
  items: T[],
  getLabel: (item: T) => string | null,
  setLabel: (item: T, label: string) => void,
  suffixOf: (item: T) => string,
): void {
  // Đếm HẾT trước rồi mới đổi: đổi dần làm phần tử sau thấy nhãn gốc của mình hết "trùng".
  const seen = new Map<string, number>();
  for (const item of items) {
    const label = getLabel(item);
    if (label !== null) seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  for (const item of items) {
    const label = getLabel(item);
    if (label !== null && (seen.get(label) ?? 0) > 1) setLabel(item, `${label} · ${suffixOf(item)}`);
  }
}
