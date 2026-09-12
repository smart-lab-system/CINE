import type { Attendance } from './api/attendance';
import type { SubmissionStatusItem } from './api/exam-session';

/**
 * Shared between the lobby page (live, one exam session) and the
 * per-session submissions detail page (post-hoc review, no socket) — both
 * render the same matrix from the same two sources, so the shape lives
 * here rather than inside either page's own component.
 */

export type DeliverableState = 'collected' | 'invalid' | 'absent' | 'pending';

export interface SubmissionRowStudent {
  studentMssv: string;
  /** Whatever the student typed into the agent; falls back to the MSSV. */
  fullName: string;
  /** Keyed by requiredDeliverableId. A missing key means "chưa nộp". */
  byDeliverable: Record<
    string,
    {
      state: DeliverableState;
      submittedAt?: string | null;
      downloadUrl?: string | null;
      fileSize?: string | null;
    }
  >;
}

export interface DeliverableColumn {
  id: string;
  requiredFilename: string;
}

/**
 * One row per student, from the union of who attended and who submitted
 * something — a student who joined but submitted nothing still needs a row
 * (all "Chưa nộp"), and a submission from someone with no attendance record
 * still needs one too.
 */
export function buildSubmissionRows(
  attendance: Attendance | undefined,
  submissions: SubmissionStatusItem[] | undefined,
): SubmissionRowStudent[] {
  const byMssv = new Map<string, SubmissionRowStudent>();

  const ensure = (mssv: string, fullName: string) => {
    const existing = byMssv.get(mssv);
    if (existing) {
      // A real name always beats the MSSV placeholder, whichever source
      // happened to be seen first.
      if (existing.fullName === mssv && fullName !== mssv) {
        existing.fullName = fullName;
      }
      return existing;
    }
    const created: SubmissionRowStudent = { studentMssv: mssv, fullName, byDeliverable: {} };
    byMssv.set(mssv, created);
    return created;
  };

  for (const student of [
    ...(attendance?.present ?? []),
    ...(attendance?.absent ?? []),
    ...(attendance?.makeup ?? []),
  ]) {
    ensure(student.mssv, student.name);
  }

  for (const item of submissions ?? []) {
    const row = ensure(item.studentMssv, item.studentNameInput || item.studentMssv);
    // `received`/`validated` tồn tại vài mili giây trong một transaction
    // phía server — không phải thứ giảng viên hành động được, nên không
    // hiện. `not_submitted` cũng không: nó rơi về "Chưa nộp", đúng bằng
    // cái mà sự vắng mặt của một dòng từng có nghĩa.
    //
    // `absent` thì CÓ hiện, và khác "Chưa nộp": nó nghĩa là một giảng
    // viên đã nhìn khắp phòng rồi kết luận (§7.1.2). Gộp hai thứ đó vào
    // một ô là xoá đúng sự phân biệt mà cả Task 3 sinh ra để tạo.
    if (item.status === 'collected' || item.status === 'invalid' || item.status === 'absent') {
      row.byDeliverable[item.requiredDeliverableId] = {
        state: item.status,
        submittedAt: item.submittedAt,
        downloadUrl: item.downloadUrl,
        fileSize: item.fileSize,
      };
    }
  }

  return [...byMssv.values()].sort((a, b) => a.studentMssv.localeCompare(b.studentMssv));
}

/** How many students have every required deliverable marked "collected". */
export function countFullySubmitted(
  rows: SubmissionRowStudent[],
  deliverables: { id: string }[],
): number {
  if (deliverables.length === 0) {
    return 0;
  }
  return rows.filter((row) =>
    deliverables.every((d) => row.byDeliverable[d.id]?.state === 'collected'),
  ).length;
}

/**
 * Bao nhiêu máy "Thu lại" sẽ nhắm tới — đã dự thi mà chưa nộp đủ.
 *
 * Phản chiếu `RecollectService.findMissing` (apps/api). Hai chỗ, một
 * định nghĩa, và đó là một đánh đổi có ý thức: con số trên nút phải tự
 * cập nhật theo sự kiện socket mà không polling (spec §7.1), nên nó phải
 * tính được từ dữ liệu trang đã có. Chúng có thể lệch nhau trong vài
 * giây giữa hai lần đồng bộ, và điều đó chấp nhận được vì con số sau khi
 * bấm — `RecollectResult.missing` — mới là con số có thẩm quyền.
 *
 * `attended` phải chỉ gồm người CÓ mặt: `rows` là hợp của roster và
 * người đã nộp, nên nó cũng chứa cả em vắng thi. Gửi lệnh thu lại cho
 * một máy chưa từng kết nối là không có gì để thu, và đếm em đó vào là
 * hứa với giảng viên một việc không làm được.
 */
export function countRecollectTargets(
  rows: SubmissionRowStudent[],
  attendedMssv: Set<string>,
  deliverables: { id: string }[],
): number {
  if (deliverables.length === 0) {
    return 0;
  }
  return rows.filter(
    (row) =>
      attendedMssv.has(row.studentMssv) &&
      !deliverables.every((d) => row.byDeliverable[d.id]?.state === 'collected'),
  ).length;
}

/**
 * Bao nhiêu SINH VIÊN có bài về sau mốc `since` (spec §7.3).
 *
 * Đếm người, không đếm file: một em nộp 2 file sau khi giảng viên xác
 * nhận là `1`, không phải `2`. Đếm file sẽ thổi con số lên theo số
 * deliverable của phiên và làm nó nói sai về số người cần nhìn lại.
 */
export function countStudentsSubmittingAfter(
  rows: SubmissionRowStudent[],
  since: number,
): number {
  return rows.filter((row) =>
    Object.values(row.byDeliverable).some(
      (entry) => entry.submittedAt != null && new Date(entry.submittedAt).getTime() > since,
    ),
  ).length;
}
