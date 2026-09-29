import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RuleSummary } from './RuleSummary';
import { rule } from './fixtures';

const rules = [
  rule({ id: 'a' }),
  rule({ id: 'b', deduction: '0.50' }),
  rule({ id: 'c', deduction: null }),
];

describe('RuleSummary', () => {
  it('ô 1: số luật đã có giá trên tổng số luật', () => {
    render(<RuleSummary rules={rules} missingCount={0} />);
    expect(screen.getByText('Luật đã có giá')).toBeInTheDocument();
    expect(screen.getByText('2 / 3 luật')).toBeInTheDocument();
  });

  it('ô 2: số luật chưa có giá đang chặn — và KHÔNG bịa số bài chờ (API không có số bài phân biệt)', () => {
    const { container } = render(<RuleSummary rules={rules} missingCount={0} />);
    expect(screen.getByText('Chưa có giá — đang chặn')).toBeInTheDocument();
    expect(screen.getByText('1 luật')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/bài chờ/);
  });

  it('ô 3: số lỗi chưa có luật', () => {
    render(<RuleSummary rules={rules} missingCount={2} />);
    expect(screen.getByText('Luật còn thiếu')).toBeInTheDocument();
    expect(screen.getByText('2 lỗi chưa có luật')).toBeInTheDocument();
  });

  it('ô 4: chưa có route → nhãn "cần backend", tuyệt đối không có con số phần trăm', () => {
    const { container } = render(<RuleSummary rules={rules} missingCount={0} />);
    expect(screen.getByText('Mức trừ do máy quyết')).toBeInTheDocument();
    expect(screen.getByText(/cần backend/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+\s?%/);
  });

  it('bảng trống vẫn hiện 0 / 0, không chia cho 0 hay hiện NaN', () => {
    const { container } = render(<RuleSummary rules={[]} missingCount={0} />);
    expect(screen.getByText('0 / 0 luật')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });
});
