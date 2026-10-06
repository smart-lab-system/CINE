import {
  administrativeCodeProblem,
  groupNameProblem,
  normalizeAdministrativeCode,
  normalizeGroupName,
} from '../../common/master-data-normalize';
import { semesterLabel } from '../../common/semester-label';
import { parseSemesterCell, shown } from './import-cells';
import { blankRow, errorRow, type ImportPlan, type ImportRowResult } from './import.types';

export interface ClassImportRow {
  line: number;
  /** Nhãn học kỳ: `HK1 2026-2027`. */
  semester: string;
  administrativeClassCode: string;
  groupName: string;
  teacherEmail: string;
}

/** Trạng thái hiện có mà planner cần — service nạp, planner không chạm DB. */
export interface ClassImportContext {
  semesters: Array<{ id: string; academicYearStart: number; term: number }>;
  administrativeClasses: Array<{ id: string; code: string }>;
  /** Chỉ cần các tài khoản có email xuất hiện trong file. */
  teachers: Array<{ id: string; email: string; name: string; role: string; isActive: boolean }>;
  classes: Array<{
    id: string;
    semesterId: string | null;
    administrativeClassId: string | null;
    groupName: string;
    teacherId: string;
    teacherName: string;
  }>;
}

export type ClassWrite =
  | {
      kind: 'create';
      semesterId: string;
      administrativeClassId: string;
      groupName: string;
      teacherId: string;
      teacherName: string;
      label: string;
    }
  | {
      kind: 'reassign';
      classId: string;
      label: string;
      fromTeacherName: string;
      toTeacherId: string;
      toTeacherName: string;
    };

/**
 * Khoá lớp khớp ràng buộc duy nhất ở DB: (học kỳ, mã lớp danh nghĩa, `lower(nhóm)`). `Nhóm 1` và `nhóm 1` là CÙNG một lớp —
 * so phân biệt hoa-thường thì dòng thứ hai thành lớp "mới" rồi cả lô vỡ ở khoá duy nhất với một câu 409 chung, đúng chỗ
 * bản xem trước phải báo trước (cùng lỗ hổng cụm 1 đã vá ở DB bằng `lower()`).
 */
function classKey(semesterId: string, administrativeClassId: string, groupName: string): string {
  return `${semesterId}|${administrativeClassId}|${groupName.toLowerCase()}`;
}

const labelOf = (code: string, groupName: string, semesterText: string) =>
  `${code}${groupName ? ` – ${groupName}` : ''} · ${semesterText}`;

/**
 * Hàm THUẦN cho import lớp. Khoá là (học kỳ, mã lớp danh nghĩa, nhóm); CHỈ SỬA giảng viên (nguyên tắc 2).
 *
 * Học kỳ, mã lớp danh nghĩa và giảng viên đều phải ĐÃ CÓ: planner chỉ TRA, không bao giờ trả về việc "tạo" cho chúng
 * (spec §2.2, T-ADM-2) — kiểu `ClassWrite` không có biến thể nào như vậy. Thiếu thì dòng lỗi, kèm câu chỉ cách khắc phục.
 *
 * Nhãn dựng cùng dạng với view `class_label.label_with_semester` (`DHKTPM18A – Nhóm 1 · HK1 2026-2027`) để bản xem trước
 * nói đúng thứ admin sẽ thấy ở danh sách lớp.
 */
export function planClassImport(
  rows: readonly ClassImportRow[],
  context: ClassImportContext,
): ImportPlan<ClassWrite> {
  const semesterByKey = new Map(context.semesters.map((s) => [`${s.academicYearStart}-${s.term}`, s]));
  const codeToId = new Map(context.administrativeClasses.map((a) => [a.code, a.id]));
  const teacherByEmail = new Map(context.teachers.map((t) => [t.email.toLowerCase(), t]));
  const classByKey = new Map(
    context.classes
      .filter((c) => c.semesterId !== null && c.administrativeClassId !== null)
      .map((c) => [classKey(c.semesterId!, c.administrativeClassId!, c.groupName), c]),
  );
  const firstLineOfKey = new Map<string, number>();
  const results: ImportRowResult[] = [];
  const writes: ClassWrite[] = [];

  for (const row of rows) {
    const problems: string[] = [];

    // Học kỳ.
    const parsedSemester = parseSemesterCell(row.semester);
    let semesterId: string | null = null;
    let semesterText: string | null = null;
    if (!parsedSemester) {
      problems.push(`Học kỳ ${shown(row.semester)} không hiểu được, cần dạng HK1 2026-2027 (hai năm liền nhau).`);
    } else {
      semesterText = semesterLabel(parsedSemester.academicYearStart, parsedSemester.term);
      const found = semesterByKey.get(`${parsedSemester.academicYearStart}-${parsedSemester.term}`);
      if (found) semesterId = found.id;
      else problems.push(`Chưa có học kỳ ${semesterText}, hãy tạo học kỳ trước.`);
    }

    // Mã lớp danh nghĩa — CHỌN trong Danh mục, không tạo.
    const code = normalizeAdministrativeCode(row.administrativeClassCode);
    let administrativeClassId: string | null = null;
    const codeProblem = administrativeCodeProblem(code);
    if (codeProblem) {
      problems.push(codeProblem);
    } else {
      administrativeClassId = codeToId.get(code) ?? null;
      if (!administrativeClassId) {
        problems.push(`Mã ${code} chưa có trong Danh mục lớp danh nghĩa, hãy thêm nó vào Danh mục trước.`);
      }
    }

    // Nhóm.
    const groupName = normalizeGroupName(row.groupName);
    const groupProblem = groupNameProblem(groupName);
    if (groupProblem) problems.push(groupProblem);

    // Giảng viên — theo email, phải là giảng viên đang hoạt động.
    const email = row.teacherEmail.trim();
    let teacher: ClassImportContext['teachers'][number] | null = null;
    if (email === '') {
      problems.push('Thiếu email giảng viên.');
    } else {
      teacher = teacherByEmail.get(email.toLowerCase()) ?? null;
      if (!teacher) {
        problems.push(`Không có tài khoản ${email}.`);
      } else if (teacher.role !== 'teacher') {
        problems.push(`${email} không phải tài khoản giảng viên.`);
        teacher = null;
      } else if (!teacher.isActive) {
        problems.push(`Tài khoản ${email} đã bị vô hiệu hoá nên không giao lớp được.`);
        teacher = null;
      }
    }

    let label =
      semesterText !== null && !codeProblem && code !== '' ? labelOf(code, groupName, semesterText) : `Dòng ${row.line}`;

    if (semesterId && administrativeClassId && !groupProblem) {
      const key = classKey(semesterId, administrativeClassId, groupName);
      const first = firstLineOfKey.get(key);
      if (first !== undefined) problems.push(`Trùng với dòng ${first}: lớp ${label} đã xuất hiện trong file.`);
      else firstLineOfKey.set(key, row.line);
    }

    if (problems.length > 0 || !semesterId || !administrativeClassId || !teacher) {
      results.push(errorRow(row.line, label, problems));
      continue;
    }

    const current = classByKey.get(classKey(semesterId, administrativeClassId, groupName));
    if (!current) {
      results.push({ ...blankRow(row.line, label), status: 'new' });
      writes.push({
        kind: 'create',
        semesterId,
        administrativeClassId,
        groupName,
        teacherId: teacher.id,
        teacherName: teacher.name,
        label,
      });
      continue;
    }

    // Lớp có sẵn: nhãn dùng tên nhóm ĐANG LƯU (như planner phòng dùng tên đang lưu), để bản xem trước nói đúng thứ sẽ thấy.
    if (semesterText !== null) label = labelOf(code, current.groupName, semesterText);
    const result = blankRow(row.line, label);
    if (current.teacherId !== teacher.id) {
      result.status = 'update';
      result.changes.push({ field: 'teacher', label: 'Giảng viên', from: current.teacherName, to: teacher.name });
      writes.push({
        kind: 'reassign',
        classId: current.id,
        label,
        fromTeacherName: current.teacherName,
        toTeacherId: teacher.id,
        toTeacherName: teacher.name,
      });
    }
    results.push(result);
  }

  return { rows: results, writes };
}
