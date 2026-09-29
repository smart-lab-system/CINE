import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LeverageLine } from './LeverageLine';

describe('LeverageLine (spec §3.3 — one action at the rule layer clears many results)', () => {
  it('says nothing when there is no lever', () => {
    const { container } = render(<LeverageLine leverage={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('states how many need-attention results are waiting on prices, and for how many rules', () => {
    render(<LeverageLine leverage={{ waiting: 8, total: 9, ruleKeys: ['ten_bien', 'sai_bien', 'rong'] }} />);
    expect(screen.getByRole('status')).toHaveTextContent('8 trong 9 bài cần xem đang chờ bạn đặt giá cho 3 luật');
  });

  // Verified on the live API: pricing the only unpriced rule removed the "unpriced" flag but EXPOSED a
  // low_confidence flag that decide() hides while other flags exist (decide.ts:188) — the result stayed flagged.
  // So the line must not promise that prices are all that stands between a result and an automatic decision.
  it('never promises pricing is enough — it says pricing clears THIS reason and another may appear', () => {
    render(<LeverageLine leverage={{ waiting: 2, total: 2, ruleKeys: ['x'] }} />);
    expect(screen.getByRole('status')).not.toHaveTextContent(/chỉ chờ/);
    expect(screen.getByRole('status')).toHaveTextContent('Đặt giá gỡ lý do này');
    expect(screen.getByRole('status')).toHaveTextContent('còn lý do khác');
  });

  it('names the rules, in mono, so the teacher knows which ones', () => {
    render(<LeverageLine leverage={{ waiting: 2, total: 2, ruleKeys: ['ten_bien', 'sai_bien'] }} />);
    expect(screen.getByText('ten_bien')).toHaveClass('font-mono');
    expect(screen.getByText('sai_bien')).toHaveClass('font-mono');
  });

  it('leads to Bảng lỗi, where the prices are set', () => {
    render(<LeverageLine leverage={{ waiting: 1, total: 1, ruleKeys: ['x'] }} />);
    expect(screen.getByRole('link', { name: 'Đặt giá ở Bảng lỗi' })).toHaveAttribute('href', '/teacher/rules');
  });
});
