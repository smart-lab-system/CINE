import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { ScoreCard } from './ScoreCard';

const perCriterion = [
  { key: 'tinh_dung', maxHundredths: 400, deductedHundredths: 150, capped: false },
  { key: 'hieu_nang', maxHundredths: 100, deductedHundredths: 100, capped: true },
];

describe('ScoreCard', () => {
  it('shows the score and a formula that sums the per-criterion deductions', () => {
    render(
      <ScoreCard
        currentScore={2.5}
        currentScoreSource="computation"
        breakdown={{ perCriterion, ungradable: null } as never}
      />,
    );
    expect(screen.getByText('2,5')).toBeInTheDocument();
    expect(screen.getByText(/tinh_dung/)).toBeInTheDocument();
    expect(screen.getByText(/chạm trần/)).toBeInTheDocument();
  });

  it('shows "—", never 0, when currentScore is null and there is no floor reason (still grading)', () => {
    render(<ScoreCard currentScore={null} currentScoreSource="none" breakdown={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('distinguishes "dưới sàn" from "không chấm được" (Review Focus #6): shows the floor reason, not a sandbox message', () => {
    render(
      <ScoreCard
        currentScore={null}
        currentScoreSource="none"
        breakdown={{ perCriterion: [], ungradable: { class: 'submission', reason: 'Tiêu chí "hieu_nang" chưa có luật nào — không tự quyết được.' } } as never}
      />,
    );
    expect(screen.getByText(/hieu_nang.*chưa có luật nào/)).toBeInTheDocument();
    expect(screen.queryByText(/môi trường chạy bài/i)).not.toBeInTheDocument();
  });

  it('shows a plain note, not a formula, when the score was set by hand', () => {
    render(<ScoreCard currentScore={9} currentScoreSource="manual" breakdown={{ perCriterion, ungradable: null } as never} />);
    // "chấm tay" legitimately appears twice (the label + the explanatory note) — assert presence.
    expect(screen.getAllByText(/chấm tay/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/−/)).not.toBeInTheDocument();
  });
});
