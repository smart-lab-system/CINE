import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { CoverageSection } from './CoverageSection';

const investigation = {
  kind: 'verdict' as const,
  summary: 'x',
  flags: [],
  verdict: { errors: [] },
  replay: { toolCallId: 'tc-3', matched: true },
  investigation: {
    toolCalls: [
      { id: 'tc-1', tool: 'run_tests', args: {}, status: 'ok', output: '', startedAt: '', wallMs: 100, injectionSuspected: false },
    ],
  },
};

describe('CoverageSection', () => {
  it('shows the replay result using real data, matched → "khớp"', () => {
    render(<CoverageSection investigation={investigation as never} />);
    expect(screen.getByText(/khớp/i)).toBeInTheDocument();
  });

  it('says the replay is unverified when matched is null, not "khớp"', () => {
    render(<CoverageSection investigation={{ ...investigation, replay: { toolCallId: 'tc-3', matched: null } } as never} />);
    expect(screen.getByText(/chưa chạy lại được|không xác định/i)).toBeInTheDocument();
  });

  // Review minor: every run_tests call was counted, including ones that errored or were blocked as duplicates
  // — inflating "what was checked", the one number this section exists to keep honest.
  it('counts only the test runs that actually ran, and says how many did not', () => {
    const call = (id: string, status: string) => ({ id, tool: 'run_tests', args: {}, status, output: '', startedAt: '', wallMs: 1, injectionSuspected: false });
    render(
      <CoverageSection
        investigation={{
          ...investigation,
          investigation: { toolCalls: [call('a', 'ok'), call('b', 'error'), call('c', 'blocked_duplicate'), call('d', 'ok')] },
        } as never}
      />,
    );
    expect(screen.getByText('Đã chạy 2 lượt gói test.')).toBeInTheDocument();
    expect(screen.getByText('2 lượt khác không chạy được (lỗi hoặc bị chặn) — không tính là đã kiểm.')).toBeInTheDocument();
  });

  it('says nothing about failed runs when there were none', () => {
    render(<CoverageSection investigation={investigation as never} />);
    expect(screen.getByText('Đã chạy 1 lượt gói test.')).toBeInTheDocument();
    expect(screen.queryByText(/không chạy được/)).not.toBeInTheDocument();
  });

  it('marks complexity analysis as not built — never fakes a chart (step 4 of the grading spec is not done)', () => {
    render(<CoverageSection investigation={investigation as never} />);
    expect(screen.getByText(/chưa có/i)).toBeInTheDocument();
  });
});
