import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionViolationsPanel } from './SessionViolationsPanel';

const listViolationsMock = vi.fn();
const getJplagRunComparisonMock = vi.fn();

vi.mock('@/lib/api/ide-utilities', () => ({
  listViolations: (...args: unknown[]) => listViolationsMock(...args),
  getJplagRunComparison: (...args: unknown[]) => getJplagRunComparisonMock(...args),
}));

vi.mock('@/components/jplag/jplag-comparison-viewer', () => ({
  JplagComparisonViewer: () => <div data-testid="jplag-viewer" />,
}));

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionViolationsPanel examSessionId="session-123" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listViolationsMock.mockReset();
  getJplagRunComparisonMock.mockReset();
});

describe('SessionViolationsPanel', () => {
  it('shows empty state when no open violations', async () => {
    listViolationsMock.mockResolvedValue([]);
    renderPanel();
    await waitFor(() =>
      expect(
        screen.getByText('Chưa có extension vi phạm chưa được duyệt trong phiên này.'),
      ).toBeInTheDocument(),
    );
    expect(listViolationsMock).toHaveBeenCalledWith('session-123');
  });

  it('lists columns and expands detail with student table and action buttons', async () => {
    listViolationsMock.mockResolvedValue([
      {
        extensionId: 'evil.tool',
        displayName: 'Evil Tool',
        publisher: 'evil',
        publishedAt: '2026-06-01T00:00:00.000Z',
        inCatalog: true,
        catalogExtensionPk: 'cat-1',
        primaryVersion: '1.0.0',
        primaryVersionId: 'ver-1',
        extractStatus: 'ready',
        jplagText: 0.42,
        jplagStatus: 'completed',
        jplagRunId: 'run-1',
        versionCount: 1,
        incidentCount: 1,
        studentCount: 1,
        versions: [
          {
            version: '1.0.0',
            incidentCount: 1,
            incidents: [
              {
                scanId: 's1',
                scanItemId: 'i1',
                examSessionId: 'session-123',
                examSessionName: 'Thi CK',
                courseId: null,
                courseName: null,
                studentMssv: 'SV001',
                studentFullName: 'Nguyen Van A',
                machineId: 'pc-1',
                machineName: 'PC-01',
                scannedAt: '2026-11-01T10:00:00.000Z',
              },
            ],
          },
        ],
      },
    ]);
    getJplagRunComparisonMock.mockResolvedValue({
      run: { id: 'run-1' },
      profile: 'text',
      cliLanguage: 'javascript',
      similarity: 0.42,
      firstSubmission: 'a',
      secondSubmission: 'b',
      comparison: { files: [], matches: [] },
      reportUrl: null,
    });

    renderPanel();

    await waitFor(() => expect(screen.getByText('Evil Tool')).toBeInTheDocument());
    expect(screen.getByText('evil')).toBeInTheDocument();
    expect(screen.getByText('42.0%')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('violation-row-evil.tool'));

    expect(screen.getByText('SV001')).toBeInTheDocument();
    expect(screen.getByText('Nguyen Van A')).toBeInTheDocument();
    expect(screen.getByText('PC-01')).toBeInTheDocument();

    const vsix = screen.getByRole('link', { name: 'Xem nội dung VSIX' });
    expect(vsix).toHaveAttribute(
      'href',
      '/teacher/ide-utilities/cat-1/versions/ver-1/browse',
    );
    const normalized = screen.getByRole('link', { name: 'Xem mã đã chuẩn hóa' });
    expect(normalized).toHaveAttribute(
      'href',
      '/teacher/ide-utilities/cat-1/versions/ver-1/browse?view=normalized',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kết quả JPlag' }));
    await waitFor(() => expect(screen.getByTestId('jplag-viewer')).toBeInTheDocument());
    expect(getJplagRunComparisonMock).toHaveBeenCalledWith('run-1', 'text');
  });

  it('disables VSIX buttons when extract is not ready', async () => {
    listViolationsMock.mockResolvedValue([
      {
        extensionId: 'evil.tool',
        displayName: 'Evil Tool',
        publisher: 'evil',
        publishedAt: null,
        inCatalog: true,
        catalogExtensionPk: 'cat-1',
        primaryVersion: '1.0.0',
        primaryVersionId: 'ver-1',
        extractStatus: 'pending',
        jplagText: null,
        jplagStatus: 'pending',
        jplagRunId: 'run-1',
        versionCount: 1,
        incidentCount: 0,
        studentCount: 0,
        versions: [],
      },
    ]);

    renderPanel();
    await waitFor(() => expect(screen.getByText('Evil Tool')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('violation-row-evil.tool'));

    const detail = screen.getByText('Mã định danh').closest('div')?.parentElement?.parentElement;
    expect(detail).toBeTruthy();
    expect(within(detail!).getByRole('button', { name: 'Xem nội dung VSIX' })).toBeDisabled();
    expect(within(detail!).getByRole('button', { name: 'Xem mã đã chuẩn hóa' })).toBeDisabled();
    expect(within(detail!).getByRole('button', { name: 'Kết quả JPlag' })).toBeDisabled();
  });
});
