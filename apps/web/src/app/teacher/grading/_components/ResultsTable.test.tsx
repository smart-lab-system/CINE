import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ResultsTable } from './ResultsTable';
import type { GradingResult, ResultDetail } from '@/lib/api/grading';

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r1', submissionId: 's1', studentMssv: '20120001', studentName: 'Nguyễn Văn A', homeClassId: 'c1', homeClassName: 'N01',
  status: 'auto_approved', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: false, ungradableReason: null,
  criterionResults: [], advocateOpinion: null, contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null,
  reviewedAt: null, reviewedByName: null, editedCriteria: null, pipeline: 'investigator', currentScore: 8.5, currentScoreSource: 'computation',
  ...over,
});

const detail = (breakdown: Partial<NonNullable<ResultDetail['breakdown']>>): ResultDetail => ({
  pipeline: 'investigator', currentScore: 8.5, currentScoreSource: 'computation', status: 'flagged_for_review',
  ungradableClass: null, ungradableReason: null,
  breakdown: { errors: [], perCriterion: [], caseFlags: [], errorFlags: [], confidence: 1, mismatchedRules: [], notConsidered: [], ungradable: null, ...breakdown },
  investigation: null, challengeNotes: [], challengeVerdicts: [],
});

const list = [
  result({ id: 'a', studentMssv: '20120010', studentName: 'An', status: 'auto_approved', currentScore: 10 }),
  result({ id: 'b', studentMssv: '20120002', studentName: 'Bình', status: 'flagged_for_review', currentScore: 8.5 }),
  result({ id: 'c', studentMssv: '20120001', studentName: 'Cường', status: 'flagged_for_review', ungradableReason: 'Môi trường chạy bài hết giờ', currentScore: null }),
];

type Props = React.ComponentProps<typeof ResultsTable>;
const props = (over: Partial<Props> = {}): Props => ({
  sessionId: 's1', sessionClassId: 'c1', results: list, details: new Map(), detailsSettled: true, filter: 'all', onFilterChange: vi.fn(), ...over,
});
const rows = () => screen.getAllByRole('row').slice(1);

describe('ResultsTable (spec §3.3)', () => {
  it('sorts what needs the teacher first, then by MSSV', () => {
    render(<ResultsTable {...props()} />);
    expect(rows().map((r) => within(r).getByRole('link').textContent)).toEqual(['20120002', '20120001', '20120010']);
  });

  it('MSSV opens the dossier and keeps the session in the URL', () => {
    render(<ResultsTable {...props()} />);
    expect(screen.getByRole('link', { name: '20120010' })).toHaveAttribute('href', '/teacher/grading/a?sessionId=s1');
  });

  it('shows status as icon + words', () => {
    render(<ResultsTable {...props()} />);
    expect(within(rows()[0]).getByText('Cần bạn xem')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('Không chấm được')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('Tự quyết')).toBeInTheDocument();
  });

  it('shows "—" and "chưa có điểm" for a result without a score, never 0; provisional scores are tagged', () => {
    render(<ResultsTable {...props()} />);
    expect(within(rows()[1]).getByText('—', { selector: '[data-cell="score"] *' })).toBeInTheDocument();
    expect(within(rows()[1]).getByText('chưa có điểm')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('10,0')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('tạm tính')).toBeInTheDocument();
  });

  it('an ungradable result shows the system reason verbatim in "vì sao cần bạn"', () => {
    render(<ResultsTable {...props()} />);
    expect(within(rows()[1]).getByText('Môi trường chạy bài hết giờ')).toBeInTheDocument();
  });

  it('a needs-you result reads its reason and error counts from the dossier', () => {
    const details = new Map([
      ['b', detail({
        errorFlags: [{ ruleKey: 'x', code: 'unpriced' }],
        errors: [
          { ruleId: '1', ruleKey: 'a', ruleName: 'A', criterionKey: 'k', source: 'deterministic', toolCallIds: [], deductionHundredths: 100, counted: 'counted' },
          { ruleId: '2', ruleKey: 'x', ruleName: 'X', criterionKey: 'k', source: 'deterministic', toolCallIds: [], deductionHundredths: null, counted: 'unpriced' },
        ],
      })],
    ]);
    render(<ResultsTable {...props({ details })} />);
    expect(within(rows()[0]).getByText('1 luật chưa có giá')).toBeInTheDocument();
    expect(within(rows()[0]).getByText('1 đã trừ · 1 chờ giá')).toBeInTheDocument();
  });

  it('says it is reading the dossier while it loads — and does not guess', () => {
    render(<ResultsTable {...props({ detailsSettled: false })} />);
    expect(within(rows()[0]).getByText('Đang xem hồ sơ…')).toBeInTheDocument();
  });

  it('once everything has settled without a dossier, points the teacher at it instead of spinning forever', () => {
    render(<ResultsTable {...props({ detailsSettled: true })} />);
    expect(within(rows()[0]).getByText('Mở hồ sơ để xem lý do.')).toBeInTheDocument();
  });

  it('flags a makeup student with the same label as the submissions screen', () => {
    render(<ResultsTable {...props({ results: [result({ homeClassId: 'other', homeClassName: 'N09' })] })} />);
    expect(screen.getByText('Thi bù — N09')).toBeInTheDocument();
  });

  it('labels an essay, and never calls a legacy auto-approved essay "Tự quyết" (T-UI-20)', () => {
    render(<ResultsTable {...props({ results: [result({ pipeline: 'one_shot', status: 'auto_approved' })] })} />);
    expect(screen.getByText('Bài tự luận')).toBeInTheDocument();
    expect(screen.queryByText('Tự quyết')).not.toBeInTheDocument();
    expect(screen.getByText('Tự duyệt theo chính sách cũ')).toBeInTheDocument();
  });

  it('an essay that needs review says why without any dossier', () => {
    render(<ResultsTable {...props({ results: [result({ pipeline: 'one_shot', status: 'flagged_for_review' })], detailsSettled: false })} />);
    expect(screen.getByText('Bài tự luận — luôn do bạn duyệt')).toBeInTheDocument();
  });

  describe('filter', () => {
    it('offers "Tất cả" and only the states that exist, each with its count, as toggles', () => {
      render(<ResultsTable {...props({ filter: 'needsYou' })} />);
      expect(screen.getByRole('button', { name: 'Tất cả · 3' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Cần bạn xem · 1' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Không chấm được · 1' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Kiểm mẫu/ })).not.toBeInTheDocument();
    });

    it('shows only the chosen state, and reports a click', () => {
      const onFilterChange = vi.fn();
      render(<ResultsTable {...props({ filter: 'auto', onFilterChange })} />);
      expect(rows()).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Tất cả · 3' }));
      expect(onFilterChange).toHaveBeenCalledWith('all');
    });

    it('a filter that matches nothing says so and points back to "Tất cả"', () => {
      render(<ResultsTable {...props({ filter: 'audit' })} />);
      expect(screen.getByText(/Không có bài nào ở nhóm này/)).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });
});
