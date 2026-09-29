import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { InvestigationTrail } from './InvestigationTrail';

const investigation = {
  summary: 'Tóm tắt hệ thống.',
  investigation: {
    toolCalls: [
      { id: 'tc-1', tool: 'run_tests', args: { group: 'bien' }, status: 'ok', output: 'PASS', startedAt: '', wallMs: 620, injectionSuspected: false },
    ],
  },
} as never;

describe('InvestigationTrail', () => {
  it('shows the §2.2 action name as the primary label, and the raw tool as a secondary mono line', () => {
    render(<InvestigationTrail investigation={investigation} />);
    expect(screen.getByText('Chạy gói test')).toBeInTheDocument();
    expect(screen.getByText('run_tests')).toHaveClass('font-mono');
  });

  it('expands a row to show its real output', () => {
    render(<InvestigationTrail investigation={investigation} />);
    fireEvent.click(screen.getByRole('button', { name: /Chạy gói test/ }));
    expect(screen.getByText('PASS')).toBeInTheDocument();
  });

  it('shows the harness summary verbatim (T-UI-4) — the field itself, not model prose reconstructed client-side', () => {
    render(<InvestigationTrail investigation={investigation} />);
    expect(screen.getByText('Tóm tắt hệ thống.')).toBeInTheDocument();
  });
});
