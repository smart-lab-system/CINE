import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { DossierHeader } from './DossierHeader';

const baseProps = {
  sessionId: 's1',
  sessionName: 'Giữa kỳ N01',
  roomName: 'B2.07',
  mssv: 'SV20120088',
  studentName: 'Nguyễn Văn A',
  status: 'flagged_for_review',
  ungradableReason: null as string | null,
  onOpenManualScore: () => {},
};

describe('DossierHeader', () => {
  it('shows MSSV, name, session and room', () => {
    render(<DossierHeader {...baseProps} />);
    // MSSV appears twice by design (breadcrumb current-item + h1) — assert presence, not uniqueness.
    expect(screen.getAllByText(/SV20120088/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Nguyễn Văn A/)).toBeInTheDocument();
    expect(screen.getAllByText(/Giữa kỳ N01/).length).toBeGreaterThan(0);
    expect(screen.getByText(/B2\.07/)).toBeInTheDocument();
  });

  // Review I4: an investigator result is a code_project, and the only registered content resolver handles
  // 'document' — so "Mở bài nộp" could only ever show "Hệ thống chưa đọc được nội dung… Tải file gốc về",
  // with no download link. A working-looking button that cannot work is worse than a labelled gap.
  it('marks "Mở bài nộp" as not built yet (disabled, "cần backend") instead of opening an empty pane', () => {
    render(<DossierHeader {...baseProps} />);
    const open = screen.getByRole('button', { name: /Mở bài nộp/ });
    expect(open).toBeDisabled();
    expect(screen.getByText('cần backend')).toBeInTheDocument();
    fireEvent.click(open);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps "Chấm tay bài này" enabled on a finalized result (Review Focus #2) and calls the handler, not a local dialog', () => {
    const onOpenManualScore = vi.fn();
    render(<DossierHeader {...baseProps} status="finalized" onOpenManualScore={onOpenManualScore} />);
    const btn = screen.getByRole('button', { name: 'Chấm tay bài này' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onOpenManualScore).toHaveBeenCalled();
  });
});
