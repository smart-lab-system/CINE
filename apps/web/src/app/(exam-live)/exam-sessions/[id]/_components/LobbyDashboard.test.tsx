import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LobbyDashboard } from './LobbyDashboard';

const base = {
  rosterSize: 40,
  presentCount: 32,
  absentCount: 8,
  makeupCount: 0,
  fullySubmitted: 10,
  notSubmitted: 30,
  invalidCount: 1,
  confirmedAt: null as string | null,
  confirmedCount: null as number | null,
  classId: 'class-1' as string | null,
};

describe('LobbyDashboard', () => {
  it('renders spec labels', () => {
    render(<LobbyDashboard {...base} />);

    expect(screen.getByText('Sĩ số lớp')).toBeInTheDocument();
    expect(screen.getByText('Có mặt')).toBeInTheDocument();
    expect(screen.getByText('Vắng mặt')).toBeInTheDocument();
    expect(screen.getByText('Đã nộp')).toBeInTheDocument();
    expect(screen.getByText('Chưa nộp')).toBeInTheDocument();
    expect(screen.getByText('File lỗi')).toBeInTheDocument();
    expect(screen.getByText(/Chưa xác nhận/)).toBeInTheDocument();
  });

  it('hides Thi bổ sung when makeupCount is 0', () => {
    render(<LobbyDashboard {...base} makeupCount={0} />);
    expect(screen.queryByText('Thi bổ sung')).not.toBeInTheDocument();
  });

  it('shows Thi bổ sung when makeupCount > 0', () => {
    render(<LobbyDashboard {...base} makeupCount={2} />);
    expect(screen.getByText('Thi bổ sung')).toBeInTheDocument();
  });

  it('shows confirmed count and time when confirmed', () => {
    render(
      <LobbyDashboard
        {...base}
        confirmedAt="2026-10-08T08:30:00.000Z"
        confirmedCount={35}
      />,
    );
    expect(screen.getByText(/Xác nhận sĩ số:/)).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.queryByText(/Chưa xác nhận/)).not.toBeInTheDocument();
  });
});
