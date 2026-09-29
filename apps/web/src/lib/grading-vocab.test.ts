import { describe, expect, it } from 'vitest';
import { caseFlagLabel, lensLabel, toolActionLabel, SOURCE_LABEL, VERDICT_LABEL } from './grading-vocab';

describe('SOURCE_LABEL', () => {
  it('uses the spec §2.2 Vietnamese labels, not the old "Model" wording', () => {
    expect(SOURCE_LABEL.llm_with_tools.label).toBe('Mô hình + công cụ');
    expect(SOURCE_LABEL.llm_only.label).toBe('Chỉ mô hình');
    expect(SOURCE_LABEL.deterministic.label).toBe('Máy quyết');
  });
});

describe('VERDICT_LABEL', () => {
  it('renders "Chưa kiểm được" for unverified, per §2.2', () => {
    expect(VERDICT_LABEL.unverified.label).toBe('Chưa kiểm được');
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
  it('never throws on an unknown code — names it instead of hiding it', () => {
    expect(caseFlagLabel('some_future_flag', 'chi tiết')).toContain('some_future_flag');
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

describe('lensLabel', () => {
  it('maps the four known lenses', () => {
    expect(lensLabel('tinh_dung')).toBe('Tính đúng');
    expect(lensLabel('gian_lan')).toBe('Gian lận');
  });
});
