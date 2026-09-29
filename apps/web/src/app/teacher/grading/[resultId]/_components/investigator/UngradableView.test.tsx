import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { UngradableView } from './UngradableView';

const investigation = {
  summary: 'x',
  investigation: { toolCalls: [{ id: 'tc-1', tool: 'run_tests', args: {}, status: 'error', output: 'timeout', startedAt: '', wallMs: 0, injectionSuspected: false }] },
} as never;

describe('UngradableView', () => {
  it('shows "—" for the score, never 0 or the max (T-UI-5)', () => {
    render(<UngradableView ungradableClass="system" ungradableReason="Sandbox không phản hồi." investigation={investigation} onOpenManualScore={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('10')).not.toBeInTheDocument();
  });

  it('says "môi trường chạy bài", never "sandbox" (spec §2.2 fix #2)', () => {
    render(<UngradableView ungradableClass="system" ungradableReason="Môi trường chạy bài không phản hồi." investigation={investigation} onOpenManualScore={vi.fn()} />);
    expect(screen.queryByText(/sandbox/i)).not.toBeInTheDocument();
  });

  it('offers a regrade path, marked cần backend, ONLY for class "system" (§2.3)', () => {
    render(<UngradableView ungradableClass="system" ungradableReason="x" investigation={investigation} onOpenManualScore={vi.fn()} />);
    const regrade = screen.getByRole('button', { name: /Chấm lại bài này/i });
    expect(regrade).toBeDisabled();
    // Two regrade buttons (one bài / cả các bài cùng lý do), each carries its own badge.
    expect(screen.getAllByText(/cần backend/i)).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Chấm lại cả các bài cùng lý do/i })).toBeDisabled();
  });

  it('never offers a regrade path for class "submission" — only chấm tay', () => {
    render(<UngradableView ungradableClass="submission" ungradableReason="x" investigation={investigation} onOpenManualScore={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Chấm lại/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chấm tay bài này' })).toBeEnabled();
  });

  it('calls onOpenManualScore, and does not mount its own dialog', () => {
    const onOpenManualScore = vi.fn();
    render(<UngradableView ungradableClass="submission" ungradableReason="x" investigation={investigation} onOpenManualScore={onOpenManualScore} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay bài này' }));
    expect(onOpenManualScore).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
