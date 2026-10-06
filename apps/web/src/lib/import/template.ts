import type { ImportKind } from './columns';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * File mẫu của một loại (spec §6.2 nguyên tắc 8): đúng tên cột chính thức, một dòng ví dụ, và một sheet "Huong dan" giải
 * thích từng cột. Dựng trong trình duyệt bằng exceljs đã dùng để ĐỌC — không thêm thư viện, không thêm file tĩnh để lệch
 * khỏi `columns.ts` (test khứ hồi bắt lệch).
 *
 * Ô ví dụ định dạng CHỮ (`@`): nếu không, Excel mở file và tự đổi `2026-09-01` thành ngày, `1` thành số — và lần lưu lại sẽ gửi
 * một chuỗi khác với cái mẫu viết.
 */
export async function buildTemplateBytes(kind: ImportKind): Promise<Uint8Array> {
  // Nạp lười như `readWorkbook`: thư viện lớn và chỉ màn hình này cần nó.
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();

  const data = workbook.addWorksheet(kind.sheetName);
  data.addRow(kind.columns.map((column) => column.label));
  data.addRow(kind.columns.map((column) => column.example));
  data.getRow(1).font = { bold: true };
  data.getRow(2).eachCell((cell) => {
    cell.numFmt = '@';
  });
  kind.columns.forEach((column, index) => {
    data.getColumn(index + 1).width = Math.max(column.label.length, column.example.length, 12) + 4;
  });

  const guide = workbook.addWorksheet('Huong dan');
  guide.addRow(['Cột', 'Bắt buộc', 'Giải thích']);
  for (const column of kind.columns) {
    guide.addRow([column.label, column.required ? 'Có' : 'Không', column.hint]);
  }
  guide.getRow(1).font = { bold: true };
  guide.getColumn(1).width = 24;
  guide.getColumn(2).width = 12;
  guide.getColumn(3).width = 70;

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** Tải file mẫu về máy. Keo dán trình duyệt (không test — phần đáng test là `buildTemplateBytes`). */
export async function downloadTemplate(kind: ImportKind): Promise<void> {
  const bytes = await buildTemplateBytes(kind);
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: XLSX_TYPE }));
  const link = document.createElement('a');
  link.href = url;
  link.download = kind.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
