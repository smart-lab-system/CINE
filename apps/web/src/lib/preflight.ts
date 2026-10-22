import type { DeclaredLanguage } from './api/exam-session';
import type { Rubric } from './api/grading';
import type { RubricOverview } from './api/rubric-errors';
import { formatVnPoints } from './format';
import { warningSentences } from './rubric-board';
import { rulesHref } from './rules-links';

/**
 * Cột "Trước khi bắt đầu" của màn chuẩn bị chấm (spec §3.7): mỗi dòng là ok · cảnh báo · chặn, và nút bắt đầu chỉ
 * bật khi không dòng nào chặn.
 *
 * Chặn = đúng những gì server từ chối (rubric, gói test đã ghim cho bài code) HOẶC spec bắt buộc (đề bài, có bài
 * để chấm) HOẶC sẽ khoá tài liệu ngay lúc chưa lưu. Cảnh báo = lỗi chưa có điểm trừ, tiêu chí chưa có lỗi: bài
 * dính chúng vào nhóm cần bạn xem.
 */
export interface PreflightInput {
  counts: { fullySubmitted: number; partial: number; attendedNoSubmission: number; neverAttended: number };
  hasRubricId: boolean;
  rubric: Rubric | undefined;
  /** `hasAnswerSource`: phiên có MÃ đáp án để chạy thử (không phải tài liệu AI đọc). */
  readiness: { hasQuestion: boolean; hasModelAnswer: boolean; hasAnswerSource?: boolean } | undefined;
  /** Mọi yêu cầu nộp của phiên. `pipeline` do BACKEND tính (`pipelineFor`) — không suy ra ở đây (G1 §3.3). */
  deliverables: {
    deliverableType: 'document' | 'code_project' | 'image';
    language: DeclaredLanguage | null;
    pipeline: 'investigator' | 'one_shot';
  }[];
  bundle: { pinned: boolean; total: number; approved: number };
  /** Tổng quan Bảng lỗi của RUBRIC ĐÃ GHIM cho phiên (đã gồm số lỗi chưa có điểm trừ và các tiêu chí đã đánh dấu không trừ điểm). */
  board: RubricOverview | undefined;
  /** Form tài liệu chấm còn thay đổi chưa lưu. */
  dirty: boolean;
  /**
   * Phiên nhiều file bắt buộc. `null` hoặc không gửi = một file, không cần xác nhận.
   * `false` = chưa xác nhận đề cương. `true` = đã xác nhận.
   */
  blueprintConfirmed?: boolean | null;
  /**
   * `review`: cột “Đã dùng để chấm” — câu sự thật, không câu hướng dẫn sửa.
   * Vắng mặt thì là màn chuẩn bị (nút bắt đầu).
   */
  mode?: 'prepare' | 'review';
}

export type PreflightStatus = 'ok' | 'warn' | 'block';

export interface PreflightRow {
  key: 'ceiling' | 'question' | 'answer' | 'bundle' | 'blueprint' | 'rules' | 'count' | 'language' | 'reference';
  label: string;
  status: PreflightStatus;
  text: string;
  link?: { href: string; label: string };
}

export function preflightOf(input: PreflightInput): {
  rows: PreflightRow[];
  canStart: boolean;
  reason: string | null;
  collected: number;
} {
  const rows: PreflightRow[] = [];
  const review = input.mode === 'review';
  const { rubric, readiness } = input;
  const codeDeliverables = input.deliverables.filter((d) => d.deliverableType === 'code_project');
  const investigators = codeDeliverables.filter((d) => d.pipeline === 'investigator');
  const readByReading = codeDeliverables.length - investigators.length;
  const undeclared = codeDeliverables.filter((d) => d.language === null).length;

  // Rubric (điểm tối đa theo tiêu chí)
  if (!input.hasRubricId) {
    rows.push({
      key: 'ceiling',
      label: 'Rubric',
      status: 'block',
      text: review ? 'Phiên chưa gắn rubric.' : 'Phiên chưa gắn rubric — gắn rubric ở dòng "Rubric" bên trái.',
    });
  } else if (!rubric) {
    rows.push({ key: 'ceiling', label: 'Rubric', status: 'block', text: 'Không tìm thấy rubric đã gắn cho phiên này.' });
  } else if (rubric.criteria.length === 0) {
    rows.push({ key: 'ceiling', label: 'Rubric', status: 'block', text: 'Rubric đang dùng không có tiêu chí nào.' });
  } else {
    rows.push({
      key: 'ceiling',
      label: 'Rubric',
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
      text: review ? 'Chưa chỉ định đề bài.' : 'Chưa chọn đề bài — chọn file đề bài ở khối "Đề bài" bên trái. Đề bài là thứ bắt buộc.',
    });
  } else {
    rows.push({ key: 'question', label: 'Đề bài', status: 'ok', text: 'Đã chỉ định.' });
  }

  // Đáp án mẫu — không bắt buộc. Mã để chạy thử và tài liệu để AI đọc là hai thứ khác nhau, nên dòng nói rõ đang có cái nào.
  if (readiness?.hasModelAnswer) {
    rows.push({ key: 'answer', label: 'Đáp án mẫu', status: 'ok', text: 'Đã có đáp án mẫu hoặc ghi chú đáp án.' });
  } else if (readiness?.hasAnswerSource) {
    rows.push({
      key: 'answer',
      label: 'Đáp án mẫu',
      status: 'warn',
      text: review
        ? 'Có mã đáp án để chạy thử. Chưa có tài liệu đáp án để AI đọc.'
        : 'Có mã đáp án để chạy thử, nhưng AI chấm chưa có tài liệu đáp án để đọc. Thêm ghi chú hoặc tài liệu nếu muốn AI đối chiếu.',
    });
  } else {
    rows.push({
      key: 'answer',
      label: 'Đáp án mẫu',
      status: 'warn',
      text: review
        ? 'Chưa có đáp án mẫu.'
        : 'Chưa có — không bắt buộc. Tải mã đáp án (.cpp, .py) để chạy thử, hoặc sinh đáp án mẫu từ đề ở khối "Gói test".',
    });
  }

  // Gói test — server đòi gói ĐÃ GHIM cho bài code đi đường điều tra
  if (investigators.length === 0) {
    rows.push({ key: 'bundle', label: 'Gói test', status: 'ok', text: 'Phiên không có bài code chạy trong môi trường chạy bài — không cần gói test.' });
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
      text: review ? `${why}.` : `${why} — bài code cần một gói đã duyệt và ghim. Làm ở khối "Gói test" bên trái.`,
    });
  }

  // Đề cương — chỉ phiên nhiều file bắt buộc. File đề và đáp án mẫu không đặt cờ này.
  if (input.blueprintConfirmed === false) {
    rows.push({
      key: 'blueprint',
      label: 'Đề cương',
      status: 'block',
      text: review
        ? 'Chưa xác nhận đề cương.'
        : 'Phiên có nhiều file bắt buộc. File đề và đáp án mẫu không thay cho bước này — bấm "Xác nhận đề cương" cạnh nút bắt đầu chấm.',
    });
  } else if (input.blueprintConfirmed === true) {
    rows.push({ key: 'blueprint', label: 'Đề cương', status: 'ok', text: 'Đề cương đã xác nhận.' });
  }

  // Bảng lỗi của rubric đã ghim — cảnh báo, không chặn
  if (!input.hasRubricId) {
    rows.push({
      key: 'rules',
      label: 'Bảng lỗi',
      status: 'warn',
      text: review ? 'Chưa có rubric nên chưa kiểm tra được Bảng lỗi.' : 'Chưa có rubric nên chưa kiểm tra được Bảng lỗi. Không chặn việc bắt đầu.',
    });
  } else if (!input.board) {
    rows.push({
      key: 'rules',
      label: 'Bảng lỗi',
      status: 'warn',
      text: review ? 'Đang đọc Bảng lỗi của rubric này…' : 'Đang đọc Bảng lỗi của rubric này… Không chặn việc bắt đầu.',
    });
  } else {
    const warnings = warningSentences(input.board);
    if (warnings.length > 0) {
      rows.push({
        key: 'rules',
        label: 'Bảng lỗi',
        status: 'warn',
        text: review ? warnings.join(' ') : `${warnings.join(' ')} Không chặn việc bắt đầu.`,
        link: { href: rulesHref(input.board.rubricName), label: 'Mở Bảng lỗi' },
      });
    } else {
      rows.push({ key: 'rules', label: 'Bảng lỗi', status: 'ok', text: 'Mọi lỗi đã có điểm trừ và mọi tiêu chí đã có lỗi.' });
    }
  }

  // Số bài sẽ chấm — chỉ bài đã thu
  const collected = input.counts.fullySubmitted + input.counts.partial;
  const countLabel = review ? 'Số bài đã thu' : 'Số bài sẽ chấm';
  if (collected === 0) {
    rows.push({
      key: 'count',
      label: countLabel,
      status: 'block',
      text: review ? 'Chưa có bài nào đã thu.' : 'Chưa có bài nào đã thu để chấm.',
    });
  } else {
    const notGraded: string[] = [];
    if (input.counts.attendedNoSubmission > 0) {
      notGraded.push(`${input.counts.attendedNoSubmission} sinh viên vào phòng nhưng không có bài`);
    }
    if (input.counts.neverAttended > 0) notGraded.push(`${input.counts.neverAttended} vắng`);
    const aside = notGraded.length > 0 ? ` ${notGraded.join(', ')} — không chấm.` : '';
    rows.push({
      key: 'count',
      label: countLabel,
      status: 'ok',
      text: review ? `${collected} bài đã thu.${aside}` : `${collected} bài đã thu sẽ được chấm.${aside}`,
    });
  }

  // Ngôn ngữ bài code — đếm theo đường chấm mà backend đã tính; không chặn (bài đọc mã vẫn chấm được)
  if (codeDeliverables.length > 0) {
    const parts: string[] = [];
    if (investigators.length > 0) parts.push(`${investigators.length} bài code chạy trong môi trường chạy bài`);
    if (readByReading > 0) {
      parts.push(
        `${readByReading} bài code chấm bằng đọc mã, không chạy${undeclared > 0 ? ` (${undeclared} bài chưa khai ngôn ngữ)` : ''}`,
      );
    }
    rows.push({
      key: 'language',
      label: 'Ngôn ngữ bài code',
      status: readByReading > 0 ? 'warn' : 'ok',
      text: `${parts.join('; ')}.`,
    });
  }

  // Tài liệu chấm chưa lưu — bắt đầu chấm sẽ khoá tài liệu. Màn xem lại không có form.
  if (input.dirty && !review) {
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
