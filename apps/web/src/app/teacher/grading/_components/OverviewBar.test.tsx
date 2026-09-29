import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OverviewBar } from './OverviewBar';
import type { SessionState } from '@/lib/session-triage';

const counts = (over: Partial<Record<SessionState, number>> = {}): Record<SessionState, number> => ({
  needsYou: 0, audit: 0, ungradable: 0, grading: 0, auto: 0, reviewed: 0, finalised: 0, ...over,
});

describe('OverviewBar (spec §3.3 — a proportional bar and five numbers with icons)', () => {
  it('shows the five numbers of the spec, in words, even at zero', () => {
    render(<OverviewBar counts={counts({ auto: 5, needsYou: 2, ungradable: 1 })} />);
    const list = screen.getByRole('list', { name: 'Số bài theo trạng thái' });
    const text = (label: string) => within(list).getByText(label).closest('li')!;
    expect(text('Tự quyết')).toHaveTextContent('5');
    expect(text('Kiểm mẫu')).toHaveTextContent('0');
    expect(text('Cần bạn xem')).toHaveTextContent('2');
    expect(text('Không chấm được')).toHaveTextContent('1');
    expect(text('Đang chấm')).toHaveTextContent('0');
  });

  it('adds "Đã duyệt" and "Đã chốt" only when there are some', () => {
    const { rerender } = render(<OverviewBar counts={counts({ auto: 1 })} />);
    expect(screen.queryByText('Đã duyệt')).not.toBeInTheDocument();
    expect(screen.queryByText('Đã chốt')).not.toBeInTheDocument();
    rerender(<OverviewBar counts={counts({ auto: 1, reviewed: 2, finalised: 3 })} />);
    expect(within(screen.getByRole('list')).getByText('Đã duyệt').closest('li')).toHaveTextContent('2');
    expect(within(screen.getByRole('list')).getByText('Đã chốt').closest('li')).toHaveTextContent('3');
  });

  it('the bar itself is described for a screen reader with every number (colour is never the only signal)', () => {
    render(<OverviewBar counts={counts({ auto: 5, needsYou: 2 })} />);
    const bar = screen.getByRole('img');
    expect(bar).toHaveAttribute('aria-label', expect.stringContaining('5 Tự quyết'));
    expect(bar).toHaveAttribute('aria-label', expect.stringContaining('2 Cần bạn xem'));
  });

  it('segments are proportional to the counts and a zero segment is left out', () => {
    render(<OverviewBar counts={counts({ auto: 3, needsYou: 1 })} />);
    const segments = screen.getByRole('img').querySelectorAll('[data-segment]');
    expect([...segments].map((s) => (s as HTMLElement).dataset.segment)).toEqual(['needsYou', 'auto']);
    expect((segments[0] as HTMLElement).style.width).toBe('25%');
    expect((segments[1] as HTMLElement).style.width).toBe('75%');
  });

  it('renders nothing for an empty session (the prepare screen owns that case)', () => {
    const { container } = render(<OverviewBar counts={counts()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
