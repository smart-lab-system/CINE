import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { UngradableView } from './UngradableView';

vi.mock('@/app/teacher/grading/_components/RegradeButton', () => ({
  RegradeButton: ({ scope, label }: { scope: unknown; label: string }) => (
    <button type="button" data-scope={JSON.stringify(scope)}>
      {label}
    </button>
  ),
}));

const investigation = {
  summary: 'x',
  investigation: { toolCalls: [{ id: 'tc-1', tool: 'run_tests', args: {}, status: 'error', output: 'timeout', startedAt: '', wallMs: 0, injectionSuspected: false }] },
} as never;

const view = (over: Partial<React.ComponentProps<typeof UngradableView>> = {}) => (
  <UngradableView
    sessionId="s1"
    resultId="r1"
    sameReasonCount={1}
    ungradableClass="system"
    ungradableReason="x"
    investigation={investigation}
    onOpenManualScore={vi.fn()}
    {...over}
  />
);

describe('UngradableView', () => {
  it('shows "—" for the score, never 0 or the max (T-UI-5)', () => {
    render(view({ ungradableReason: 'Sandbox không phản hồi.' }));
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('10')).not.toBeInTheDocument();
  });

  it('says "môi trường chạy bài", never "sandbox" (spec §2.2 fix #2)', () => {
    render(view({ ungradableReason: 'Môi trường chạy bài không phản hồi.' }));
    expect(screen.queryByText(/sandbox/i)).not.toBeInTheDocument();
  });

  it('class "system": a real regrade for THIS result, and one for all results sharing the reason when there are several (§2.3)', () => {
    render(view({ sameReasonCount: 3, ungradableReason: 'Dịch vụ AI không phản hồi.' }));
    const one = screen.getByRole('button', { name: 'Chấm lại bài này' });
    expect(one).toBeEnabled();
    expect(one).toHaveAttribute('data-scope', JSON.stringify({ kind: 'result', sessionId: 's1', resultId: 'r1' }));
    const all = screen.getByRole('button', { name: 'Chấm lại cả 3 bài cùng lý do' });
    expect(all).toHaveAttribute(
      'data-scope',
      JSON.stringify({ kind: 'session', sessionId: 's1', reason: 'Dịch vụ AI không phản hồi.', count: 3 }),
    );
    expect(screen.queryByText(/cần backend/i)).not.toBeInTheDocument();
  });

  it('with no other result sharing the reason there is no "cả … bài" button — it would only repeat the first', () => {
    render(view({ sameReasonCount: 1 }));
    expect(screen.getByRole('button', { name: 'Chấm lại bài này' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chấm lại cả/ })).not.toBeInTheDocument();
  });

  it('never offers a regrade path for class "submission" — only chấm tay', () => {
    render(view({ ungradableClass: 'submission' }));
    expect(screen.queryByRole('button', { name: /Chấm lại/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chấm tay bài này' })).toBeEnabled();
  });

  it('calls onOpenManualScore, and does not mount its own dialog', () => {
    const onOpenManualScore = vi.fn();
    render(view({ ungradableClass: 'submission', onOpenManualScore }));
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay bài này' }));
    expect(onOpenManualScore).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
