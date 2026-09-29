import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ApplyPreview, type PreviewState } from './ApplyPreview';
import type { RulePreview } from '@/lib/api/rules';

const ready = (preview: RulePreview): PreviewState => ({ status: 'ready', preview });

describe('ApplyPreview (spec §3.2 "Lưu thì áp vào đâu")', () => {
  it('lists the four tiers of §2.2 and marks only the rule\'s own tier', () => {
    render(<ApplyPreview tier={3} state={{ status: 'invalid' }} />);
    const items = within(screen.getByRole('list', { name: 'Bốn bậc áp luật' })).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    const current = items.filter((li) => li.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Luật máy kiểm được, cần chạy lại công cụ');
  });

  it('marks the current tier in words too — colour is never the only signal', () => {
    render(<ApplyPreview tier={2} state={{ status: 'invalid' }} />);
    expect(screen.getByText('Luật đang soạn')).toBeInTheDocument();
  });

  it('states the scope: all of my results, running sessions and later terms, except finalized sessions', () => {
    render(<ApplyPreview tier={4} state={{ status: 'invalid' }} />);
    expect(screen.getByText(/trừ phiên đã chốt/)).toBeInTheDocument();
    expect(screen.getByText(/không bao giờ sang bài của giảng viên khác/)).toBeInTheDocument();
  });

  it('asks for the missing fields instead of showing an empty table while the form is not valid', () => {
    render(<ApplyPreview tier={2} state={{ status: 'invalid' }} />);
    expect(screen.getByText(/Điền tên, mô tả, tiêu chí/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('says it is loading', () => {
    render(<ApplyPreview tier={2} state={{ status: 'loading' }} />);
    expect(screen.getByText('Đang xem trước…')).toBeInTheDocument();
  });

  it('shows the server message verbatim when the preview fails', () => {
    render(<ApplyPreview tier={2} state={{ status: 'error', message: 'Điều kiện: có trường lạ' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Điều kiện: có trường lạ');
  });

  describe('tier 2 — matched results', () => {
    const tier2 = (results: Extract<RulePreview, { tier: 2 }>['results']) => ready({ tier: 2, results });

    it('converts each side correctly: `before` is a decimal STRING (points), `after` is integer HUNDREDTHS', () => {
      render(
        <ApplyPreview
          tier={2}
          state={tier2([{ resultId: 'aaaaaaaa-1111', sessionId: 's1', before: '9.50', after: 850, capped: false }])}
        />,
      );
      const row = screen.getByRole('row', { name: /aaaaaaaa/ });
      expect(within(row).getByText('9,5')).toBeInTheDocument();
      expect(within(row).getByText('8,5')).toBeInTheDocument();
    });

    it('says how many results match and links each to its dossier with the session', () => {
      render(
        <ApplyPreview
          tier={2}
          state={tier2([
            { resultId: 'aaaaaaaa-1111', sessionId: 's1', before: '10.00', after: 900, capped: false },
            { resultId: 'bbbbbbbb-2222', sessionId: 's2', before: '8.00', after: 700, capped: false },
          ])}
        />,
      );
      expect(screen.getByText('2 bài khớp luật này')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /aaaaaaaa/ })).toHaveAttribute('href', '/teacher/grading/aaaaaaaa-1111?sessionId=s1');
    });

    it('flags a result that hits the criterion ceiling', () => {
      render(
        <ApplyPreview
          tier={2}
          state={tier2([{ resultId: 'aaaaaaaa-1111', sessionId: 's1', before: '3.00', after: 200, capped: true }])}
        />,
      );
      expect(screen.getByText('Chạm trần')).toBeInTheDocument();
    });

    it('shows "—", never "0", when a side has no score (no score yet, or the price is not set)', () => {
      render(
        <ApplyPreview
          tier={2}
          state={tier2([{ resultId: 'aaaaaaaa-1111', sessionId: 's1', before: null, after: null, capped: false }])}
        />,
      );
      expect(within(screen.getByRole('row', { name: /aaaaaaaa/ })).getAllByText('—')).toHaveLength(2);
    });

    it('says plainly when no result matches', () => {
      render(<ApplyPreview tier={2} state={tier2([])} />);
      expect(screen.getByText('Chưa có bài nào khớp luật này.')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('tier 3 — a tool call that never ran (this version)', () => {
    it('shows the API reason verbatim and says saving recalculates nothing already graded', () => {
      render(<ApplyPreview tier={3} state={ready({ tier: 3, reason: 'cần công cụ đọc cấu trúc mã (chưa xây)' })} />);
      expect(screen.getByText('cần công cụ đọc cấu trúc mã (chưa xây)')).toBeInTheDocument();
      expect(screen.getByText(/không tính lại bài nào đã chấm/)).toBeInTheDocument();
    });

    it('labels the re-run estimate "cần backend" instead of inventing a number', () => {
      render(<ApplyPreview tier={3} state={ready({ tier: 3, reason: 'x' })} />);
      expect(screen.getByText('cần backend')).toBeInTheDocument();
      expect(screen.getByText(/ước lượng thời gian/i)).toBeInTheDocument();
    });
  });

  describe('tier 4 — a rule in words', () => {
    it('splits sessions into "Không xét" (already graded) and "Sẽ xét"', () => {
      render(
        <ApplyPreview
          tier={4}
          state={ready({
            tier: 4,
            sessions: [
              { sessionId: 's1', name: 'Giữa kỳ N01', graded: true },
              { sessionId: 's2', name: 'Cuối kỳ N02', graded: false },
            ],
          })}
        />,
      );
      expect(within(screen.getByRole('row', { name: /Giữa kỳ N01/ })).getByText('Không xét — đã chấm')).toBeInTheDocument();
      expect(within(screen.getByRole('row', { name: /Cuối kỳ N02/ })).getByText('Sẽ xét')).toBeInTheDocument();
    });

    it('says plainly when there are no sessions', () => {
      render(<ApplyPreview tier={4} state={ready({ tier: 4, sessions: [] })} />);
      expect(screen.getByText('Bạn chưa có phiên nào.')).toBeInTheDocument();
    });
  });

  it('keeps to the spec vocabulary — no "sandbox", no "lăng kính"', () => {
    const { container } = render(<ApplyPreview tier={3} state={ready({ tier: 3, reason: 'x' })} />);
    expect(container.textContent).not.toMatch(/sandbox|lăng kính/i);
  });
});
