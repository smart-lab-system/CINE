import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ResultsTable } from './ResultsTable';
import type { GradingResult } from '@/lib/api/grading';

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r1', submissionId: 's1', studentMssv: '20120001', studentName: 'Nguyễn Văn A', homeClassId: 'c1', homeClassName: 'N01',
  status: 'auto_approved', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: false, ungradableReason: null,
  criterionResults: [], advocateOpinion: null, contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null,
  reviewedAt: null, reviewedByName: null, editedCriteria: null, pipeline: 'investigator', currentScore: 8.5, currentScoreSource: 'computation',
  ...over,
});

const list = [
  result({ id: 'a', studentMssv: '20120010', studentName: 'An', status: 'auto_approved', currentScore: 10 }),
  result({ id: 'b', studentMssv: '20120002', studentName: 'Bình', status: 'flagged_for_review', currentScore: 8.5 }),
  result({ id: 'c', studentMssv: '20120001', studentName: 'Cường', status: 'flagged_for_review', ungradableReason: 'Môi trường chạy bài hết giờ', currentScore: null }),
];

type Props = React.ComponentProps<typeof ResultsTable>;
const props = (over: Partial<Props> = {}): Props => ({
  sessionId: 's1', sessionClassId: 'c1', results: list, filter: 'all', onFilterChange: vi.fn(), ...over,
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

  it('a needs-you result reads its reason and error counts from its own triage — no dossier request', () => {
    const triage = {
      caseFlags: [], errorFlags: [{ ruleKey: 'x', code: 'unpriced' }],
      counts: { counted: 1, unpriced: 1, refuted: 0, excluded: 0 },
    };
    render(<ResultsTable {...props({ results: [result({ id: 'b', status: 'flagged_for_review', triage })] })} />);
    expect(screen.getByText('1 luật chưa có giá')).toBeInTheDocument();
    expect(screen.getByText('1 đã trừ · 1 chờ giá')).toBeInTheDocument();
  });

  // Review Focus 4: a code result with no triage is never guessed at — and never left spinning.
  it('a needs-you code result without triage points the teacher at the dossier', () => {
    render(<ResultsTable {...props()} />);
    expect(within(rows()[0]).getByText('Mở hồ sơ để xem lý do.')).toBeInTheDocument();
    expect(screen.queryByText('Đang xem hồ sơ…')).not.toBeInTheDocument();
  });

  it('the errors cell is "—" without triage, and "Không lỗi nào" with an empty one (not the same thing)', () => {
    const empty = { caseFlags: [], errorFlags: [], counts: { counted: 0, unpriced: 0, refuted: 0, excluded: 0 } };
    render(
      <ResultsTable
        {...props({ results: [result({ id: 'p', studentMssv: '1', triage: null }), result({ id: 'q', studentMssv: '2', triage: empty })] })}
      />,
    );
    expect(within(rows()[0]).getByText('—', { selector: 'td.tabular-nums' })).toBeInTheDocument();
    expect(within(rows()[1]).getByText('Không lỗi nào')).toBeInTheDocument();
  });

  it('labels a code result graded by reading — never as an essay — and says why it needs the teacher (T-UI-19)', () => {
    render(
      <ResultsTable
        {...props({ results: [result({ pipeline: 'one_shot', deliverableType: 'code_project', deliverableLanguage: 'java', status: 'flagged_for_review' })] })}
      />,
    );
    expect(screen.getByText('Chấm bằng đọc mã, không chạy')).toBeInTheDocument();
    expect(screen.queryByText('Bài tự luận')).not.toBeInTheDocument();
    expect(screen.getByText('Bài code chấm bằng đọc mã — luôn do bạn duyệt')).toBeInTheDocument();
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
    render(<ResultsTable {...props({ results: [result({ pipeline: 'one_shot', status: 'flagged_for_review' })] })} />);
    expect(screen.getByText('Bài tự luận — luôn do bạn duyệt')).toBeInTheDocument();
  });

  it('an audit-pending row hides the score behind "ẩn", says why, and still opens the dossier (T-SAMP-1)', () => {
    render(<ResultsTable {...props({ results: [result({ id: 'q', studentMssv: '20120099', status: 'audit_pending', currentScore: 8.63, triage: null })] })} />);
    const row = rows()[0];
    expect(within(row).getByText('ẩn')).toBeInTheDocument();
    expect(within(row).getByText('chờ nhận xét của bạn')).toBeInTheDocument();
    expect(row).not.toHaveTextContent('8,6');
    expect(row).not.toHaveTextContent('8.63');
    expect(within(row).getByText('Kiểm mẫu ngẫu nhiên — ghi nhận xét của bạn trước, điểm hệ thống hiện sau.')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: '20120099' })).toHaveAttribute('href', '/teacher/grading/q?sessionId=s1');
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
