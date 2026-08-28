import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('./roster-api', () => ({
  previewRosterImport: vi.fn(),
  applyRosterImport: vi.fn(),
  listCourseSectionFiles: vi.fn(),
  downloadCourseSectionFile: vi.fn(),
}));

import {
  applyRosterImport,
  listCourseSectionFiles,
  previewRosterImport,
} from './roster-api';
import { RosterImportPanel } from './roster-import-panel';

const SECTION_ID = '11111111-1111-4111-8111-111111111111';

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RosterImportPanel sectionId={SECTION_ID} sectionCode="INT3306-01" />
    </QueryClientProvider>,
  );
}

describe('RosterImportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCourseSectionFiles).mockResolvedValue({ items: [], total: 0 });
  });

  it('keeps apply disabled on a section-code mismatch until confirmed', async () => {
    vi.mocked(previewRosterImport).mockResolvedValue({
      storedObjectId: '22222222-2222-4222-8222-222222222222',
      originalFilename: 'ds.xls',
      sectionCodeFromFile: '422001525826',
      sectionCodeMismatch: true,
      students: [{ studentCode: '22691861', fullName: 'Nguyễn Gia Bảo' }],
    });

    renderPanel();

    const input = screen.getByLabelText(/file excel/i) as HTMLInputElement;
    const file = new File(['stub'], 'ds.xls', { type: 'application/vnd.ms-excel' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /xem trước/i }));

    await waitFor(() => {
      expect(screen.getByText(/mã lớp trên file/i)).toBeInTheDocument();
    });

    const apply = screen.getByRole('button', { name: /áp dụng danh sách/i });
    expect(apply).toBeDisabled();

    fireEvent.click(
      screen.getByRole('checkbox', { name: /xác nhận nhập dù mã lớp không khớp/i }),
    );
    expect(apply).toBeEnabled();

    fireEvent.click(apply);
    await waitFor(() => {
      expect(applyRosterImport).toHaveBeenCalledWith(
        SECTION_ID,
        '22222222-2222-4222-8222-222222222222',
        true,
      );
    });
  });
});
