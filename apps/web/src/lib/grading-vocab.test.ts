import { describe, expect, it } from 'vitest';
import { caseFlagLabel, lensLabel, mergedVerdict, toolActionLabel, toolCallStatusLabel, SOURCE_LABEL, VERDICT_LABEL } from './grading-vocab';

describe('SOURCE_LABEL (spec §5.8a)', () => {
  it('dùng nhãn giảng viên và mức chắc chắn 100 / 85 / 50 %', () => {
    expect(SOURCE_LABEL.deterministic).toMatchObject({ label: 'Chạy bài kiểm tra', certaintyPercent: 100 });
    expect(SOURCE_LABEL.llm_with_tools).toMatchObject({ label: 'Đọc code + chạy thử', certaintyPercent: 85 });
    expect(SOURCE_LABEL.llm_only).toMatchObject({ label: 'Đọc code, nhận định', certaintyPercent: 50 });
  });

  it('câu giải thích không dùng từ của AI (model, AI, agent)', () => {
    for (const source of Object.values(SOURCE_LABEL)) {
      expect(source.explain).not.toMatch(/model|\bAI\b|agent/i);
    }
  });
});

describe('VERDICT_LABEL (spec §5.8a)', () => {
  it('"Chưa kiểm tra lại được" cho unverified, và "Đề nghị bỏ lỗi này" cho refuted', () => {
    expect(VERDICT_LABEL.unverified.label).toBe('Chưa kiểm tra lại được');
    expect(VERDICT_LABEL.refuted.label).toBe('Đề nghị bỏ lỗi này');
  });
});

describe('caseFlagLabel', () => {
  it('maps a known code', () => {
    expect(caseFlagLabel('criterion_without_rules', 'tiêu chí "hieu_nang" không có luật nào trỏ vào')).toBe(
      'Tiêu chí chưa có luật nào',
    );
  });
  it('resolves investigation_flag by its detail, not its code', () => {
    expect(caseFlagLabel('investigation_flag', 'budget_exhausted')).toBe('Hết lượt điều tra trước khi xong');
  });
  it('Task 10A — injection_suspected kèm nguồn vẫn ra nhãn chính, không rơi về "chưa có tên hiển thị"', () => {
    expect(caseFlagLabel('investigation_flag', 'injection_suspected:submission_pattern,tool_output')).toBe(
      'Bài có chỗ giống lời dặn gửi cho hệ thống chấm',
    );
  });
  it('never throws on an unknown code — names it instead of hiding it', () => {
    expect(caseFlagLabel('some_future_flag', 'chi tiết')).toContain('some_future_flag');
  });
  // investigation_flag không nằm ở đây: nhãn của nó tra theo detail (INVESTIGATION_FLAG_LABEL), có test riêng ở trên.
  it('có nhãn cho mọi mã cờ cấp bài mà backend phát — không mã nào rơi về "chưa có tên hiển thị"', () => {
    const BACKEND_CODES = [
      'criterion_untouched',
      'criterion_without_rules',
      'nothing_passed',
      'low_confidence',
      'not_code_pipeline',
      'challenge_suspected',
      'challenge_incomplete',
      'ruler_unverified',
      'type_auto_disabled',
      'no_error_auto_disabled',
    ];
    for (const code of BACKEND_CODES) {
      expect(caseFlagLabel(code, 'chi tiết')).not.toContain('chưa có tên hiển thị');
    }
  });
  it('challenge_suspected gọi tên chung, vì nguồn của nó là hai lăng kính cấp bài (gian lận và bỏ sót)', () => {
    expect(caseFlagLabel('challenge_suspected', 'bo_sot: có thể bỏ sót')).toBe('Góc kiểm phản biện nêu nghi vấn');
  });
});

describe('toolActionLabel', () => {
  it('maps run_tests to the §2.2 action name, not the tool name', () => {
    expect(toolActionLabel('run_tests')).toBe('Chạy gói test');
  });
  it('falls back to the raw name for an unmapped tool', () => {
    expect(toolActionLabel('future_tool')).toBe('future_tool');
  });
});

describe('lensLabel (spec §5.8a: câu hỏi của góc kiểm)', () => {
  it('nêu bốn góc kiểm dưới dạng câu hỏi cho giảng viên', () => {
    expect(lensLabel('tinh_dung')).toBe('Lỗi có thật không?');
    expect(lensLabel('qua_tay')).toBe('Trừ vậy có nặng quá không?');
    expect(lensLabel('bo_sot')).toBe('Có bỏ sót lỗi nào không?');
    expect(lensLabel('gian_lan')).toBe('Có dấu hiệu gian lận không?');
  });
});

/**
 * Gộp kết luận của nhiều góc kiểm cho MỘT lỗi — phải trùng mergedStatusOf ở backend (decision/decide.ts,
 * finding W5), không thì màu dòng lỗi nói một đằng còn nút hành động (dựa trên cờ backend) đi một nẻo.
 */
describe('mergedVerdict', () => {
  it('một góc kiểm bác bỏ là đủ để bác bỏ, dù góc khác xác nhận', () => {
    expect(mergedVerdict(['confirmed', 'refuted'])).toBe('refuted');
    expect(mergedVerdict(['unverified', 'refuted', 'confirmed'])).toBe('refuted');
  });
  it('một góc kiểm xác nhận là đủ để xác nhận, miễn là không ai bác bỏ — góc không trả lời được không kéo tụt nó', () => {
    expect(mergedVerdict(['confirmed', 'unverified'])).toBe('confirmed');
    expect(mergedVerdict(['unverified', 'confirmed'])).toBe('confirmed');
  });
  it('chỉ "chưa kiểm được" khi KHÔNG góc kiểm nào trả lời được', () => {
    expect(mergedVerdict(['unverified'])).toBe('unverified');
    expect(mergedVerdict(['unverified', 'unverified'])).toBe('unverified');
  });
  it('một góc kiểm thì giữ nguyên', () => {
    expect(mergedVerdict(['confirmed'])).toBe('confirmed');
  });
});

describe('toolCallStatusLabel', () => {
  it('nói bằng chữ cả bốn trạng thái của backend (ToolCallStatus), không chỉ bằng biểu tượng', () => {
    expect(toolCallStatusLabel('ok')).toBe('Xong');
    expect(toolCallStatusLabel('error')).toBe('Lỗi');
    expect(toolCallStatusLabel('blocked_duplicate')).toBe('Bị chặn — trùng lời gọi trước');
    expect(toolCallStatusLabel('unavailable')).toBe('Không dùng được');
  });
  it('trạng thái lạ vẫn hiện nguyên mã, không bỏ trống', () => {
    expect(toolCallStatusLabel('brand_new')).toBe('brand_new');
  });
});
