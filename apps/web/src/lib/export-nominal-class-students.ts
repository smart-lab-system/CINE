import { listStudents, type NominalClass, type Student } from '@/lib/api/master-data';
import { studentStatusLabel, type StudentStatusLabel } from '@/lib/master-data-defaults';

const PAGE_SIZE = 100;

/** Lấy hết SV của một lớp danh nghĩa (API giới hạn 100/trang). */
export async function fetchAllStudentsForNominalClass(
  nominalClassId: string,
): Promise<Student[]> {
  const first = await listStudents({
    page: 1,
    pageSize: PAGE_SIZE,
    nominalClassId,
  });
  const items = [...first.items];
  const totalPages = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
  for (let page = 2; page <= totalPages; page++) {
    const next = await listStudents({
      page,
      pageSize: PAGE_SIZE,
      nominalClassId,
    });
    items.push(...next.items);
  }
  return items.sort((a, b) => a.mssv.localeCompare(b.mssv, 'vi'));
}

function safeFilenamePart(code: string): string {
  const cleaned = code.replace(/[^\w.-]+/g, '_').replace(/^_|_$/g, '');
  return cleaned || 'lop';
}

/**
 * Xuất .xlsx danh sách sinh viên lớp danh nghĩa (đọc trên trình duyệt, không
 * upload file lên server).
 */
export async function exportNominalClassStudentsExcel(
  klass: Pick<NominalClass, 'id' | 'code' | 'name'>,
): Promise<{ count: number }> {
  const students = await fetchAllStudentsForNominalClass(klass.id);
  if (students.length === 0) {
    throw new Error('Lớp này chưa có sinh viên để xuất.');
  }

  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('SinhVien');

  sheet.addRow([`Danh sách sinh viên — ${klass.code}`]);
  if (klass.name) {
    sheet.addRow([klass.name]);
  }
  sheet.addRow([]);
  sheet.addRow(['STT', 'MSSV', 'Họ và tên', 'Trạng thái']);

  students.forEach((s, index) => {
    sheet.addRow([
      index + 1,
      s.mssv,
      s.fullName,
      studentStatusLabel(s.status as StudentStatusLabel),
    ]);
  });

  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 32;
  sheet.getColumn(4).width = 18;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sinh-vien-${safeFilenamePart(klass.code)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);

  return { count: students.length };
}
