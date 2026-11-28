import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { GradingResult } from '@/lib/api/grading';
import { SessionIncidents, aiServiceIncident } from './SessionIncidents';

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r', submissionId: 's', studentMssv: '1', studentName: 'An', homeClassId: 'c', homeClassName: 'N01',
  status: 'flagged_for_review', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: true,
  ungradableReason: 'Dịch vụ AI không phản hồi.', criterionResults: [], advocateOpinion: null,
  contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null, reviewedAt: null,
  reviewedByName: null, editedCriteria: null, pipeline: 'one_shot', currentScore: null,
  currentScoreSource: 'computation', ungradableClass: 'system', ...over,
});

describe('aiServiceIncident', () => {
  it('two system-class results with the same reason → count and reason', () => {
    expect(aiServiceIncident([result({ id: 'a' }), result({ id: 'b' })])).toEqual({ count: 2, reason: 'Dịch vụ AI không phản hồi.' });
  });

  it('one stopped result, two with different reasons, or submission-class / class-less results → null', () => {
    expect(aiServiceIncident([result({ id: 'a' })])).toBeNull();
    expect(aiServiceIncident([result({ id: 'a' }), result({ id: 'b', ungradableReason: 'Hết giờ' })])).toBeNull();
    expect(
      aiServiceIncident([result({ id: 'a', ungradableClass: 'submission' }), result({ id: 'b', ungradableClass: 'submission' })]),
    ).toBeNull();
    expect(
      aiServiceIncident([result({ id: 'a', ungradableClass: undefined }), result({ id: 'b', ungradableClass: undefined })]),
    ).toBeNull();
  });

  it('names the LARGEST group', () => {
    const list = [
      result({ id: 'a', ungradableReason: 'Hết giờ' }),
      result({ id: 'b', ungradableReason: 'Hết giờ' }),
      result({ id: 'c', ungradableReason: 'Hết giờ' }),
      result({ id: 'd', ungradableReason: 'AI lỗi' }),
      result({ id: 'e', ungradableReason: 'AI lỗi' }),
    ];
    expect(aiServiceIncident(list)).toEqual({ count: 3, reason: 'Hết giờ' });
  });
});

describe('SessionIncidents', () => {
  const ai = { count: 2, reason: 'Dịch vụ AI không phản hồi.' };

  it('renders nothing when there is no incident', () => {
    const empty = render(<SessionIncidents />);
    expect(empty.container).toBeEmptyDOMElement();
    const nulls = render(<SessionIncidents aiService={null} stuck={null} stopped={null} />);
    expect(nulls.container).toBeEmptyDOMElement();
  });

  it('AI service line quotes the reason, says what it measures, and has no button', () => {
    render(<SessionIncidents aiService={ai} />);
    expect(screen.getByText(/Dịch vụ AI lỗi - 2 bài không chấm được cùng một lý do/)).toBeInTheDocument();
    expect(screen.getByText(/“Dịch vụ AI không phản hồi\.”/)).toBeInTheDocument();
    expect(screen.getByText(/không đo được khoảng thời gian/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('a reason that already ends with a full stop is not followed by a second one (screenshot 27/11: "cần chấm lại.”.")', () => {
    const { container } = render(<SessionIncidents aiService={{ count: 2, reason: 'Máy chấm tạm thời không phản hồi; cần chấm lại.' }} />);
    expect(container.textContent).toContain('“Máy chấm tạm thời không phản hồi; cần chấm lại.”');
    expect(container.textContent).not.toContain('”.');
  });

  it('stuck line says how many, and how long when it is known', () => {
    const { rerender } = render(<SessionIncidents stuck={{ count: 3, stall: '2 phút' }} />);
    expect(screen.getByText(/3 bài đang bị kẹt/)).toBeInTheDocument();
    expect(screen.getByText(/Không có bài nào hoàn thành trong 2 phút/)).toBeInTheDocument();
    rerender(<SessionIncidents stuck={{ count: 3, stall: null }} />);
    expect(screen.queryByText(/Không có bài nào hoàn thành/)).not.toBeInTheDocument();
  });

  it('stopped line with regradable ones says how many can be regraded and points to the one button', () => {
    render(<SessionIncidents stopped={{ count: 2, regradable: 2 }} />);
    expect(screen.getByText(/2 bài đã dừng/)).toBeInTheDocument();
    expect(screen.getByText(/2 bài trong số đó chấm lại được/)).toBeInTheDocument();
    expect(screen.getByText('Bấm nút chấm lại ở đầu trang để xếp lại các bài lỗi hệ thống.')).toBeInTheDocument();
  });

  it('stopped line with nothing regradable (all submission-class) has no regrade clause and no pointer to the button', () => {
    render(<SessionIncidents stopped={{ count: 1, regradable: 0 }} />);
    expect(screen.getByText(/1 bài đã dừng/)).toBeInTheDocument();
    expect(screen.queryByText(/chấm lại được/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bấm nút chấm lại/)).not.toBeInTheDocument();
  });

  it('all three incidents share ONE alert, one list of three items and one closing sentence', () => {
    render(<SessionIncidents aiService={ai} stuck={{ count: 3, stall: null }} stopped={{ count: 2, regradable: 2 }} />);
    const alerts = screen.getAllByRole('status');
    expect(alerts).toHaveLength(1);
    expect(within(alerts[0]).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByText(/Bấm nút chấm lại ở đầu trang/)).toHaveLength(1);
  });

  it('a reason without a final stop still ends its sentence (no run-on)', () => {
    const { container } = render(<SessionIncidents aiService={{ count: 2, reason: 'Hết giờ' }} />);
    expect(container.textContent).toContain('“Hết giờ”. Đếm trong danh sách');
  });

  it('stopped results that are not regradable do not blame the system', () => {
    const { container } = render(<SessionIncidents stopped={{ count: 1, regradable: 0 }} />);
    expect(container.textContent).toContain('1 bài đã dừng.');
    expect(container.textContent).not.toContain('vì lỗi hệ thống');
  });

  it('a stuck line with a submission-only stop: one closing sentence, naming both kinds, no regrade clause for the stopped one', () => {
    render(<SessionIncidents stuck={{ count: 1, stall: null }} stopped={{ count: 1, regradable: 0 }} />);
    expect(screen.getAllByText(/Bấm nút chấm lại/)).toHaveLength(1);
    expect(screen.getByText(/các bài lỗi hệ thống và bài bị kẹt/)).toBeInTheDocument();
    expect(screen.queryByText(/chấm lại được/)).not.toBeInTheDocument();
  });

  it('the incident is announced politely (role status), so a poll does not re-interrupt', () => {
    render(<SessionIncidents stuck={{ count: 1, stall: '2 phút' }} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('the list keeps its role for VoiceOver (Tailwind removes list-style)', () => {
    render(<SessionIncidents stuck={{ count: 1, stall: null }} />);
    expect(screen.getByRole('list')).toHaveAttribute('role', 'list');
  });
});
