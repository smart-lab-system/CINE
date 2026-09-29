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

  it('marks complexity analysis as not built — never fakes a chart (step 4 of the grading spec is not done)', () => {
    render(<CoverageSection investigation={investigation as never} />);
    expect(screen.getByText(/chưa có/i)).toBeInTheDocument();
  });
});
