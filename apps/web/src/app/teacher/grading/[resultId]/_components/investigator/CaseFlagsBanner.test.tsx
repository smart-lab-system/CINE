import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { CaseFlagsBanner } from './CaseFlagsBanner';

describe('CaseFlagsBanner', () => {
  it('renders one line per case flag, code as primary and detail as a secondary mono line (T-UI-23)', () => {
    render(
      <CaseFlagsBanner
        caseFlags={[{ code: 'criterion_without_rules', detail: 'tiêu chí "hieu_nang" không có luật nào trỏ vào' }]}
        errorFlags={[]}
        onManualScore={vi.fn()}
      />,
    );
    expect(screen.getByText('Tiêu chí chưa có luật nào')).toBeInTheDocument();
    expect(screen.getByText('tiêu chí "hieu_nang" không có luật nào trỏ vào')).toHaveClass('font-mono');
  });

  it('never hides an unmapped code — still shows a line with the raw code (T-UI-23)', () => {
    render(<CaseFlagsBanner caseFlags={[{ code: 'brand_new_flag', detail: 'chi tiết lạ' }]} errorFlags={[]} onManualScore={vi.fn()} />);
    expect(screen.getByText(/brand_new_flag/)).toBeInTheDocument();
  });

  it('offers "Đặt giá" linking to Bảng lỗi for an unpriced error flag', () => {
    render(<CaseFlagsBanner caseFlags={[]} errorFlags={[{ ruleKey: 'ten_bien', code: 'unpriced' }]} onManualScore={vi.fn()} />);
    expect(screen.getByRole('link', { name: /Đặt giá/i })).toHaveAttribute('href', '/teacher/rules');
  });

  it('offers "Chấm tay bài này" for a flag with no rule-level fix, and calls the handler', () => {
    const onManualScore = vi.fn();
    render(
      <CaseFlagsBanner
        caseFlags={[{ code: 'low_confidence', detail: 'confidence 0.72 < θ 0.85' }]}
        errorFlags={[]}
        onManualScore={onManualScore}
      />,
    );
    screen.getByRole('button', { name: 'Chấm tay bài này' }).click();
    expect(onManualScore).toHaveBeenCalled();
  });

  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<CaseFlagsBanner caseFlags={[]} errorFlags={[]} onManualScore={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
