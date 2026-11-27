import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { StatusPill } from './status-pill';

describe('StatusPill', () => {
  it('shows "Cần bạn xem" for flagged_for_review without an ungradable reason', () => {
    render(<StatusPill status="flagged_for_review" ungradableReason={null} />);
    expect(screen.getByText(/Cần bạn xem/i)).toBeInTheDocument();
  });
  it('shows "Không chấm được" when flagged AND ungradableReason is set, not "Cần bạn xem"', () => {
    render(<StatusPill status="flagged_for_review" ungradableReason="Sandbox không phản hồi." />);
    expect(screen.getByText('Không chấm được')).toBeInTheDocument();
    expect(screen.queryByText(/Cần bạn xem/i)).not.toBeInTheDocument();
  });
  it('shows "AI tự chốt" for auto_approved', () => {
    render(<StatusPill status="auto_approved" ungradableReason={null} />);
    expect(screen.getByText('AI tự chốt')).toBeInTheDocument();
  });
  it('shows "Kiểm mẫu" for audit_pending (Review Focus #3 - reachable even though nothing produces it yet)', () => {
    render(<StatusPill status="audit_pending" ungradableReason={null} />);
    expect(screen.getByText('Kiểm mẫu')).toBeInTheDocument();
  });
  it('never crashes on an unmapped status - names it instead of throwing', () => {
    render(<StatusPill status="some_future_status" ungradableReason={null} />);
    expect(screen.getByText('some_future_status')).toBeInTheDocument();
  });
});

describe('StatusPill - essays never carry a machine-decision label (spec §3.11, T-UI-20)', () => {
  it('a legacy auto-approved essay is "tự duyệt theo chính sách cũ", not "AI tự chốt"', () => {
    render(<StatusPill status="auto_approved" ungradableReason={null} pipeline="one_shot" />);
    expect(screen.getByText('Đã chốt theo quy tắc cũ')).toBeInTheDocument();
    expect(screen.queryByText('AI tự chốt')).not.toBeInTheDocument();
  });
  it('a code result keeps "AI tự chốt"', () => {
    render(<StatusPill status="auto_approved" ungradableReason={null} pipeline="investigator" />);
    expect(screen.getByText('AI tự chốt')).toBeInTheDocument();
  });
  it('the other states do not depend on the pipeline', () => {
    render(<StatusPill status="flagged_for_review" ungradableReason={null} pipeline="one_shot" />);
    expect(screen.getByText('Cần bạn xem')).toBeInTheDocument();
  });
});
