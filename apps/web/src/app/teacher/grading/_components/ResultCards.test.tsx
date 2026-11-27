import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { GradingResult } from '@/lib/api/grading';
import { ResultCards } from './ResultCards';
import { resultRowView } from './result-row-view';

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r1', submissionId: 's1', studentMssv: '20120001', studentName: 'Nguyễn Văn A', homeClassId: 'c1', homeClassName: 'N01',
  status: 'auto_approved', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: false, ungradableReason: null,
  criterionResults: [], advocateOpinion: null, contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null,
  reviewedAt: null, reviewedByName: null, editedCriteria: null, pipeline: 'investigator', currentScore: 8.5, currentScoreSource: 'computation',
  ...over,
});

const ctx = { sessionId: 's1', sessionClassId: 'c1' };
const views = (list: GradingResult[]) => list.map((r) => resultRowView(r, ctx));
const cardOf = (mssv: string) => screen.getByRole('link', { name: mssv }).closest('li') as HTMLElement;

describe('ResultCards', () => {
  it('shows mssv link, name, status, score with its tag, errors and reason', () => {
    const triage = {
      caseFlags: [], errorFlags: [{ ruleKey: 'x', code: 'unpriced' }],
      counts: { counted: 1, unpriced: 1, refuted: 0, excluded: 0 },
    };
    render(<ResultCards views={views([result({ id: 'b', studentMssv: '20120002', studentName: 'Bình', status: 'flagged_for_review', triage })])} showMethodChip />);
    const card = cardOf('20120002');
    expect(within(card).getByText('Bình')).toBeInTheDocument();
    expect(within(card).getByText('Cần bạn xem')).toBeInTheDocument();
    expect(within(card).getByText('8,5')).toBeInTheDocument();
    expect(within(card).getByText('tạm tính')).toBeInTheDocument();
    expect(card).toHaveTextContent('1 đã trừ · 1 chờ giá · 1 luật chưa có giá');
  });

  it('MSSV opens the dossier and keeps the session in the URL', () => {
    render(<ResultCards views={views([result({ id: 'a', studentMssv: '20120010' })])} showMethodChip />);
    expect(screen.getByRole('link', { name: '20120010' })).toHaveAttribute('href', '/teacher/grading/a?sessionId=s1');
  });

  it('an ungradable card shows the system reason verbatim and "chưa có điểm", never 0', () => {
    const list = [result({ studentMssv: '20120001', status: 'flagged_for_review', ungradableReason: 'Môi trường chạy bài hết giờ', currentScore: null })];
    render(<ResultCards views={views(list)} showMethodChip />);
    const card = cardOf('20120001');
    expect(within(card).getByText('Môi trường chạy bài hết giờ')).toBeInTheDocument();
    expect(within(card).getByText('chưa có điểm')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('0,0');
  });

  it('the MSSV link has a 40px tap area without making the card taller', () => {
    render(<ResultCards views={views([result({ studentMssv: '20120010' })])} showMethodChip />);
    expect(screen.getByRole('link', { name: '20120010' })).toHaveClass('py-2.5', '-my-2.5');
  });

  it('a makeup student is flagged', () => {
    render(<ResultCards views={views([result({ homeClassId: 'other', homeClassName: 'N09' })])} showMethodChip />);
    expect(screen.getByText('Thi bù - N09')).toBeInTheDocument();
  });

  it('an audit-pending card hides the score behind "ẩn" and never shows the system score', () => {
    const list = [result({ id: 'q', studentMssv: '20120099', status: 'audit_pending', currentScore: 8.63, triage: null })];
    render(<ResultCards views={views(list)} showMethodChip />);
    const card = cardOf('20120099');
    expect(within(card).getByText('ẩn')).toBeInTheDocument();
    expect(within(card).getByText('chờ nhận xét của bạn')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('8,6');
    expect(card).not.toHaveTextContent('8.63');
    expect(within(card).getByRole('link', { name: '20120099' })).toHaveAttribute('href', '/teacher/grading/q?sessionId=s1');
  });

  it('showMethodChip false drops the reading-code chip but keeps the essay chip', () => {
    const list = [
      result({ id: 'p', studentMssv: '1', pipeline: 'one_shot', deliverableType: 'code_project', status: 'flagged_for_review' }),
      result({ id: 'q', studentMssv: '2', pipeline: 'one_shot', status: 'flagged_for_review' }),
    ];
    const { rerender } = render(<ResultCards views={views(list)} showMethodChip />);
    expect(screen.getByText('Chấm bằng đọc mã, không chạy')).toBeInTheDocument();
    expect(screen.getByText('Bài tự luận')).toBeInTheDocument();
    rerender(<ResultCards views={views(list)} showMethodChip={false} />);
    expect(screen.queryByText('Chấm bằng đọc mã, không chạy')).not.toBeInTheDocument();
    expect(screen.getByText('Bài tự luận')).toBeInTheDocument();
  });
});
