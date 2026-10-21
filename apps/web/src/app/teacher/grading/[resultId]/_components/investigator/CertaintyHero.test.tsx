import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CertaintyHero, certaintyState, sumAgreement } from './CertaintyHero';
import type { ConfidenceTerm } from '@/lib/api/grading';

const NONE: ConfidenceTerm[] = [];
const ONE_ERROR: ConfidenceTerm[] = [{ ruleKey: 'ro_ri_bo_nho', source: 'llm_only', cap: 0.5, deductionHundredths: 100 }];
const NO_AGREEMENT = { n: 0, disagreements: 0, paused: false };

describe('certaintyState', () => {
  it('đạt / vừa đủ / chưa đạt quanh ngưỡng θ = 0,85', () => {
    expect(certaintyState({ confidence: 0.95, theta: 0.85, hasPricedErrors: true, paused: false })).toBe('reached');
    expect(certaintyState({ confidence: 0.85, theta: 0.85, hasPricedErrors: true, paused: false })).toBe('borderline');
    expect(certaintyState({ confidence: 0.75, theta: 0.85, hasPricedErrors: true, paused: false })).toBe('below');
  });

  it('bài không có lỗi nào → chưa đo được, dù confidence nội bộ là 1,0', () => {
    expect(certaintyState({ confidence: 1, theta: 0.85, hasPricedErrors: false, paused: false })).toBe('unmeasured');
  });

  it('thuộc loại đã tạm dừng tự chốt → paused, trước mọi trạng thái khác', () => {
    expect(certaintyState({ confidence: 0.95, theta: 0.85, hasPricedErrors: true, paused: true })).toBe('paused');
  });
});

describe('CertaintyHero', () => {
  it('có lỗi: hiện số % lớn, chip bằng chữ kèm số điểm phần trăm còn thiếu', () => {
    render(<CertaintyHero confidence={0.75} theta={0.85} terms={ONE_ERROR} agreement={NO_AGREEMENT} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText(/Chưa đạt ngưỡng · thiếu 10 điểm phần trăm/)).toBeInTheDocument();
    expect(screen.getByText(/ro_ri_bo_nho/)).toBeInTheDocument();
  });

  it('bài không có lỗi nào: KHÔNG hiện số %, nói "Chưa đo được" và cảnh báo không có nghĩa là đúng', () => {
    render(<CertaintyHero confidence={1} theta={0.85} terms={NONE} agreement={NO_AGREEMENT} />);
    expect(screen.getByText('Chưa đo được')).toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    expect(screen.queryByText('Đạt ngưỡng')).not.toBeInTheDocument();
    expect(screen.getByText('Bài không có lỗi nào')).toBeInTheDocument();
    expect(screen.getByText(/Không thấy lỗi không có nghĩa là bài đúng/)).toBeInTheDocument();
  });

  it('bài thuộc loại đã tạm dừng: chip nêu rõ và không có vạch ngưỡng', () => {
    render(<CertaintyHero confidence={0.9} theta={0.85} terms={ONE_ERROR} agreement={{ n: 2, disagreements: 1, paused: true }} />);
    expect(screen.getByText('Đã tạm dừng tự chốt cho loại bài này')).toBeInTheDocument();
    expect(screen.queryByTestId('threshold-marker')).not.toBeInTheDocument();
  });

  it('độ khớp: "bạn đồng ý N/M lần", hoặc nói chưa có bài kiểm tra nào khi n = 0', () => {
    const { unmount } = render(<CertaintyHero confidence={0.9} theta={0.85} terms={ONE_ERROR} agreement={{ n: 3, disagreements: 1, paused: false }} />);
    expect(screen.getByText(/bạn đồng ý 2\/3 lần/)).toBeInTheDocument();
    unmount();
    render(<CertaintyHero confidence={0.9} theta={0.85} terms={ONE_ERROR} agreement={NO_AGREEMENT} />);
    expect(screen.getByText(/chưa có bài kiểm tra ngẫu nhiên nào/)).toBeInTheDocument();
  });
});

describe('sumAgreement', () => {
  it('cộng dồn các quy tắc của bài; một quy tắc tạm dừng là cả bài tạm dừng', () => {
    expect(sumAgreement([{ n: 2, disagreements: 1, paused: false }, { n: 3, disagreements: 0, paused: true }])).toEqual({
      n: 5, disagreements: 1, paused: true,
    });
  });
});
