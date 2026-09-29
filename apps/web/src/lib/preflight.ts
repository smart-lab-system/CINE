import type { Rubric } from './api/grading';
import type { Rule } from './api/rules';
import { formatVnPoints } from './format';

/**
 * Cột "Trước khi bắt đầu" của màn chuẩn bị chấm (spec §3.7): mỗi dòng là ok · cảnh báo · chặn, và nút bắt đầu chỉ
 * bật khi không dòng nào chặn.
 *
 * Chặn = đúng những gì server từ chối (rubric, gói test đã ghim cho bài code) HOẶC spec bắt buộc (đề bài, có bài
 * để chấm) HOẶC sẽ khoá tài liệu ngay lúc chưa lưu. Cảnh báo = thứ không chặn nhưng ảnh hưởng kết quả (luật chưa
 * giá, tiêu chí chưa có luật): bài dính chúng vào nhóm cần bạn xem.
 */
export interface PreflightInput {
  counts: { fullySubmitted: number; partial: number; attendedNoSubmission: number; neverAttended: number };
  hasRubricId: boolean;
  rubric: Rubric | undefined;
  readiness: { hasQuestion: boolean; hasModelAnswer: boolean } | undefined;
  /** Phiên có ít nhất một deliverable `code_project`. */
  hasCodeDeliverable: boolean;
  bundle: { pinned: boolean; total: number; approved: number };
  /** Luật ĐANG DÙNG của giảng viên. */
  rules: Rule[];
  /** Khoá các tiêu chí đã đánh dấu "không có luật trừ" (theo rubric đã ghim). */
  waivedKeys: string[];
  /** Form tài liệu chấm còn thay đổi chưa lưu. */
  dirty: boolean;
}

export type PreflightStatus = 'ok' | 'warn' | 'block';

export interface PreflightRow {
  key: 'ceiling' | 'question' | 'answer' | 'bundle' | 'rules' | 'count' | 'language' | 'reference';
  label: string;
  status: PreflightStatus;
  text: string;
  link?: { href: string; label: string };
  /** Chỗ này cần một phần API chưa có — hiện nhãn "cần backend". */
  needsBackend?: true;
}

export function preflightOf(input: PreflightInput): {
  rows: PreflightRow[];
  canStart: boolean;
  reason: string | null;
  collected: number;
} {
  const rows: PreflightRow[] = [];
  const { rubric, readiness } = input;

  // Trần điểm
  if (!input.hasRubricId) {
    rows.push({ key: 'ceiling', label: 'Trần điểm', status: 'block', text: 'Phiên chưa gắn rubric — gắn rubric ở dòng "Trần điểm" bên trái.' });
  } else if (!rubric) {
    rows.push({ key: 'ceiling', label: 'Trần điểm', status: 'block', text: 'Không tìm thấy rubric đã gắn cho phiên này.' });
  } else if (rubric.criteria.length === 0) {
    rows.push({ key: 'ceiling', label: 'Trần điểm', status: 'block', text: 'Rubric đang dùng không có tiêu chí nào.' });
  } else {
    rows.push({
      key: 'ceiling',
      label: 'Trần điểm',
      status: 'ok',
      text: `${rubric.name} — phiên bản ${rubric.version}, ${formatVnPoints(rubric.totalPoints)} điểm, ${rubric.criteria.length} tiêu chí`,
    });
  }

  // Đề bài — bắt buộc (spec §3.7)
  if (!readiness) {
    rows.push({ key: 'question', label: 'Đề bài', status: 'block', text: 'Đang đọc mức sẵn sàng của phiên…' });
  } else if (!readiness.hasQuestion) {
    rows.push({
      key: 'question',
      label: 'Đề bài',
      status: 'block',
      text: 'Chưa chọn đề bài — chọn file đề bài ở khối "Đề bài" bên trái. Đề bài là thứ bắt buộc.',
    });
  } else {
    rows.push({ key: 'question', label: 'Đề bài', status: 'ok', text: 'Đã chỉ định.' });
  }

  // Đáp án mẫu — không bắt buộc
  if (readiness?.hasModelAnswer) {
    rows.push({ key: 'answer', label: 'Đáp án mẫu', status: 'ok', text: 'Đã có đáp án mẫu hoặc ghi chú đáp án.' });
  } else {
    rows.push({
      key: 'answer',
      label: 'Đáp án mẫu',
      status: 'warn',
      text: 'Chưa có — không bắt buộc. Một dòng ghi chú đáp án cũng đủ; hệ thống tự dựng đáp án từ đề thì chưa làm được.',
      needsBackend: true,
    });
  }

  // Gói test — server đòi gói ĐÃ GHIM cho bài code đi đường điều tra
  if (!input.hasCodeDeliverable) {
    rows.push({ key: 'bundle', label: 'Gói test', status: 'ok', text: 'Phiên không có bài code — không cần gói test.' });
  } else if (input.bundle.pinned) {
    rows.push({ key: 'bundle', label: 'Gói test', status: 'ok', text: 'Đã ghim một gói test đã duyệt.' });
  } else {
    const why =
      input.bundle.total === 0
        ? 'Chưa có gói test nào'
        : input.bundle.approved === 0
          ? 'Có gói test nhưng chưa duyệt'
          : 'Có gói đã duyệt nhưng chưa ghim';
    rows.push({
      key: 'bundle',
      label: 'Gói test',
      status: 'block',
      text: `${why} — bài code cần một gói đã duyệt và ghim. Làm ở khối "Gói test" bên trái.`,
    });
  }

  // Bảng lỗi — cảnh báo, không chặn
  const unpriced = input.rules.filter((r) => r.deduction === null).length;
  const ruleKeys = new Set(input.rules.map((r) => r.revision.criterionKey));
  const waived = new Set(input.waivedKeys);
  const withoutRules = (rubric?.criteria ?? []).map((c) => c.key).filter((key) => !ruleKeys.has(key) && !waived.has(key));
  const ruleWarnings: string[] = [];
  if (unpriced > 0) ruleWarnings.push(`${unpriced} luật chưa có giá — bài dính chúng sẽ vào nhóm cần bạn xem.`);
  if (withoutRules.length > 0) {
    ruleWarnings.push(`Tiêu chí ${withoutRules.join(', ')} chưa có luật nào — bài dính tiêu chí đó không tự quyết.`);
  }
  if (ruleWarnings.length > 0) {
    rows.push({
      key: 'rules',
      label: 'Bảng lỗi',
      status: 'warn',
      text: `${ruleWarnings.join(' ')} Không chặn việc bắt đầu.`,
      link: { href: '/teacher/rules', label: 'Mở Bảng lỗi' },
    });
  } else {
    rows.push({ key: 'rules', label: 'Bảng lỗi', status: 'ok', text: 'Mọi luật đã có giá và mọi tiêu chí đã có luật.' });
  }

  // Số bài sẽ chấm — chỉ bài đã thu
  const collected = input.counts.fullySubmitted + input.counts.partial;
  if (collected === 0) {
    rows.push({ key: 'count', label: 'Số bài sẽ chấm', status: 'block', text: 'Chưa có bài nào đã thu để chấm.' });
  } else {
    const notGraded: string[] = [];
    if (input.counts.attendedNoSubmission > 0) {
      notGraded.push(`${input.counts.attendedNoSubmission} sinh viên vào phòng nhưng không có bài`);
    }
    if (input.counts.neverAttended > 0) notGraded.push(`${input.counts.neverAttended} vắng`);
    rows.push({
      key: 'count',
      label: 'Số bài sẽ chấm',
      status: 'ok',
      text: `${collected} bài đã thu sẽ được chấm.${notGraded.length > 0 ? ` ${notGraded.join(', ')} — không chấm.` : ''}`,
    });
  }

  // Ngôn ngữ bài code — API chưa trả
  if (input.hasCodeDeliverable) {
    rows.push({
      key: 'language',
      label: 'Ngôn ngữ bài code',
      status: 'warn',
      text: 'Chưa đọc được từ API. Bài code chưa khai ngôn ngữ sẽ chấm theo đường cũ — đọc mã, không chạy.',
      needsBackend: true,
    });
  }

  // Tài liệu chấm chưa lưu — bắt đầu chấm sẽ khoá tài liệu
  if (input.dirty) {
    rows.push({
      key: 'reference',
      label: 'Tài liệu chấm',
      status: 'block',
      text: 'Tài liệu chấm có thay đổi chưa lưu — bấm "Lưu tài liệu chấm" trước, vì bắt đầu chấm sẽ khoá chúng.',
    });
  }

  const blocking = rows.find((r) => r.status === 'block');
  return { rows, canStart: blocking === undefined, reason: blocking?.text ?? null, collected };
}
