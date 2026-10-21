import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ConfidenceBreakdown, weightedConfidence } from './ConfidenceBreakdown';
import type { ConfidenceTerm } from '@/lib/api/grading';

/** HS2410018: một lỗi máy quyết 150, ba lỗi chỉ mô hình 100 + 50 + 50 (§5.8, mục 6). */
const HS2410018: ConfidenceTerm[] = [
  { ruleKey: 'sai_ca_bien', source: 'deterministic', cap: 1, deductionHundredths: 150 },
  { ruleKey: 'ro_ri_bo_nho', source: 'llm_only', cap: 0.5, deductionHundredths: 100 },
  { ruleKey: 'ten_bien_vo_nghia', source: 'llm_only', cap: 0.5, deductionHundredths: 50 },
  { ruleKey: 'thieu_chu_thich', source: 'llm_only', cap: 0.5, deductionHundredths: 50 },
];

describe('weightedConfidence', () => {
  it('HS2410018 → ≈ 0,714, cùng con số backend tính bằng caseConfidence', () => {
    expect(weightedConfidence(HS2410018)).toBeCloseTo(0.714, 3);
  });

  it('không có lỗi có điểm → null', () => {
    expect(weightedConfidence([])).toBeNull();
  });
});

describe('ConfidenceBreakdown', () => {
  it('hiện từng lỗi với nguồn, trần và mức trừ; trung bình có trọng số; so với ngưỡng', () => {
    render(<ConfidenceBreakdown terms={HS2410018} confidence={250 / 350} theta={0.85} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText('sai_ca_bien')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Chạy bài kiểm tra')).toBeInTheDocument();
    expect(within(rows[1]).getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/71%/)).toBeInTheDocument();
    expect(screen.getByText('Cần từ 85% mới tự chốt.')).toBeInTheDocument();
  });

  it('không hiện dòng "giới hạn khác kéo xuống" khi giá trị đã lưu khớp phép tính lại', () => {
    render(<ConfidenceBreakdown terms={HS2410018} confidence={250 / 350} theta={0.85} />);
    expect(screen.queryByText(/giới hạn khác kéo xuống/)).not.toBeInTheDocument();
  });

  it('chênh quá 1e-9 với giá trị đã lưu → hiện "giới hạn khác kéo xuống"', () => {
    render(<ConfidenceBreakdown terms={HS2410018} confidence={0.5} theta={0.85} />);
    expect(screen.getByText('giới hạn khác kéo xuống 50%')).toBeInTheDocument();
  });

  it('không có lỗi có điểm → nói rõ mức chắc chắn không lấy từ lỗi nào, không có bảng', () => {
    render(<ConfidenceBreakdown terms={[]} confidence={1} theta={0.85} />);
    expect(screen.getByText(/mức chắc chắn không lấy từ lỗi nào/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
