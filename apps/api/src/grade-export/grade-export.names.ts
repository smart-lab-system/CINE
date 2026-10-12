/**
 * Tên file tải về, từ tên file giảng viên đã chọn. Chỉ để hiển thị (đi vào `Content-Disposition` qua
 * `StorageService`): bỏ dấu phân cách đường dẫn và ký tự điều khiển, cắt độ dài, bỏ MỘT đuôi `.xlsx`.
 */
export function outputFileName(templateFileName: string): string {
  const base =
    templateFileName
      .replace(/[\\/]/g, '_')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/\.xlsx$/i, '')
      .trim()
      .slice(0, 200) || 'so-diem';
  return `${base}-da-ghi-diem.xlsx`;
}
