import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SubmissionStatusTable } from './SubmissionStatusTable';
import type { DeliverableColumn, SubmissionRowStudent } from '@/lib/submission-rows';

// QA-reported gap (point 2): "chưa có cột định dạng file nộp" — the teacher
// had no way to see what format a submitted file is without opening it.
// No dedicated test file existed for this component before (it was only
// exercised indirectly through the parent page's test) — this file tests
// it directly against its own props, since it takes no data-fetching
// dependency of its own.
describe('SubmissionStatusTable — file format', () => {
  const deliverables: DeliverableColumn[] = [
    { id: 'd1', requiredFilename: 'Cau1.docx' },
    { id: 'd2', requiredFilename: 'BaiTap' }, // no extension — edge case
  ];

  function openDialogFor(student: SubmissionRowStudent) {
    render(<SubmissionStatusTable deliverables={deliverables} students={[student]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem bài nộp' }));
  }

  it('shows the file format, derived from the required filename, once a file was actually submitted', () => {
    openDialogFor({
      studentMssv: 'SV001',
      fullName: 'Nguyễn Văn A',
      byDeliverable: {
        d1: { state: 'collected', downloadUrl: 'https://storage.example/cau1.docx', fileSize: '2048' },
      },
    });

    expect(screen.getByText('Định dạng: DOCX')).toBeInTheDocument();
  });

  it('does not claim a format for a deliverable nobody submitted yet, even while a sibling deliverable was', () => {
    // d1 stays pending (no entry at all); d2 IS collected, so the "Xem bài
    // nộp" button is enabled and the dialog genuinely opens with both rows
    // visible — a vacuous pass (dialog never opening) would prove nothing.
    openDialogFor({
      studentMssv: 'SV002',
      fullName: 'Trần Thị B',
      byDeliverable: {
        d2: { state: 'collected', downloadUrl: 'https://storage.example/baitap', fileSize: '1024' },
      },
    });

    // 'Cau1.docx' also appears as the underlying table's column header,
    // which stays mounted behind the dialog — scope to the dialog first.
    const dialog = screen.getByRole('dialog');
    const pendingRow = within(dialog).getByText('Cau1.docx').closest('div');
    expect(pendingRow).not.toBeNull();
    expect(within(pendingRow as HTMLElement).queryByText(/Định dạng:/)).not.toBeInTheDocument();
  });

  it('omits the format line for a required filename with no extension, instead of showing an empty label', () => {
    openDialogFor({
      studentMssv: 'SV003',
      fullName: 'Lê Văn C',
      byDeliverable: {
        d2: { state: 'collected', downloadUrl: 'https://storage.example/baitap', fileSize: '1024' },
      },
    });

    expect(screen.queryByText(/Định dạng:/)).not.toBeInTheDocument();
  });
});

// QA-reported gap: "khi ấn vào 'Xem bài nộp' và tải file về, thì lại tải
// một file kì lạ chứ ko phải bài của sinh viên" — the real fix is the
// API's Content-Disposition header (cross-origin, so the HTML `download`
// attribute alone is browser-ignored for this link), but this attribute
// should still name the real file rather than silently having none.
describe('SubmissionStatusTable — download link filename', () => {
  const deliverables: DeliverableColumn[] = [{ id: 'd1', requiredFilename: 'Cau1.docx' }];

  it('names the download after the required filename, not left blank', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[
          {
            studentMssv: 'SV001',
            fullName: 'Nguyễn Văn A',
            byDeliverable: {
              d1: { state: 'collected', downloadUrl: 'https://storage.example/signed', fileSize: '2048' },
            },
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xem bài nộp' }));

    const link = screen.getByRole('link', { name: 'Mở file' });
    expect(link).toHaveAttribute('download', 'Cau1.docx');
    expect(link).toHaveAttribute('href', 'https://storage.example/signed');
  });
});

// The default empty-students copy ("Bảng sẽ tự cập nhật...") assumes a live,
// still-updating table — true on the lobby page, false on the post-hoc
// submissions detail page that reuses this same component. An override
// keeps one component instead of two near-identical copies.
describe('SubmissionStatusTable — empty-students copy', () => {
  const deliverables: DeliverableColumn[] = [{ id: 'd1', requiredFilename: 'Cau1.docx' }];

  it('shows the default live-page copy when no override is given', () => {
    render(<SubmissionStatusTable deliverables={deliverables} students={[]} />);

    expect(
      screen.getByText(/Bảng sẽ tự cập nhật ngay khi agent trên máy sinh viên nộp bài/),
    ).toBeInTheDocument();
  });

  it('shows the caller-supplied copy instead, when given one', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[]}
        emptyStudentsDescription="Chưa có sinh viên nào nộp bài trong phiên này."
      />,
    );

    expect(
      screen.getByText('Chưa có sinh viên nào nộp bài trong phiên này.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Bảng sẽ tự cập nhật ngay khi agent trên máy sinh viên nộp bài/),
    ).not.toBeInTheDocument();
  });
});

describe('SubmissionStatusTable — focusStudentMssv', () => {
  const deliverables = [{ id: 'd1', requiredFilename: 'Cau1.docx' }];
  const makeStudent = (mssv: string): SubmissionRowStudent => ({
    studentMssv: mssv,
    fullName: `SV ${mssv}`,
    byDeliverable: {
      d1: { state: 'collected', submittedAt: '2026-09-01T10:00:00Z', downloadUrl: 'https://x.test/f' },
    },
  });

  it('bẫy 6: không có prop thì không mở dialog', () => {
    render(<SubmissionStatusTable deliverables={deliverables} students={[makeStudent('A1')]} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('bẫy 1: dữ liệu về SAU render đầu vẫn mở dialog', () => {
    const { rerender } = render(
      <SubmissionStatusTable deliverables={deliverables} students={[]} focusStudentMssv="A1" />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[makeStudent('A1')]}
        focusStudentMssv="A1"
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('SV A1 · A1')).toBeInTheDocument();
  });

  it('bẫy 2: refetch (mảng students đổi identity) KHÔNG mở lại dialog đã đóng', async () => {
    const students = [makeStudent('A1')];
    const { rerender } = render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={students}
        focusStudentMssv="A1"
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // GV đóng dialog.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Bẫy 4 (nửa focus): dialog này mở bằng code, không có trigger để Radix
    // tự trả focus về — mặc định của nó là <body>, và giảng viên mất vị trí
    // đang đọc, trừ khi onCloseAutoFocus can thiệp. Radix's FocusScope chạy
    // bước trả-focus-mặc-định của nó trong một setTimeout(0) khi
    // DialogContent unmount (xem @radix-ui/react-focus-scope), tức là SAU
    // khi fireEvent ở trên đã return — nên assertion này phải chờ nó bằng
    // waitFor thay vì đọc document.activeElement ngay lập tức.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Xem bài nộp' })).toHaveFocus();
    });

    // React Query refetch: cùng nội dung, mảng MỚI.
    rerender(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[makeStudent('A1')]}
        focusStudentMssv="A1"
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('bẫy 3: MSSV không tồn tại thì im lặng, không crash, không dialog', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[makeStudent('A1')]}
        focusStudentMssv="KHONG-TON-TAI"
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('SV A1')).toBeInTheDocument();
  });

  it('dòng được nhắm tới có aria-current để không chỉ dựa vào màu (bẫy 4)', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[makeStudent('A1'), makeStudent('B2')]}
        focusStudentMssv="B2"
      />,
    );
    // Matching focusStudentMssv also opens that student's dialog (bẫy 6),
    // and Radix marks the background aria-hidden while a dialog is open —
    // so the rows must be queried with `hidden: true` to look past that
    // transient a11y-hiding rather than through it never existing.
    const rows = screen.getAllByRole('row', { hidden: true });
    const marked = rows.filter((row) => row.getAttribute('aria-current') === 'true');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent('B2');
  });

  // Not in the brief's Step 1 test block verbatim, but bẫy 5 is one of the
  // six the task explicitly requires code AND a test for — without this,
  // the `reduceMotion ? 'auto' : 'smooth'` branch would be untested. The
  // global vitest.setup.ts stub always returns matches: false, so this
  // test overrides window.matchMedia itself to exercise the reduce branch,
  // and restores both stubs afterwards so it doesn't leak into other tests.
  it('bẫy 5: prefers-reduced-motion thì cuộn tức thì thay vì mượt', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        media: query,
        matches: query === '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;

    const scrollIntoViewSpy = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});

    try {
      render(
        <SubmissionStatusTable
          deliverables={deliverables}
          students={[makeStudent('A1')]}
          focusStudentMssv="A1"
        />,
      );

      expect(scrollIntoViewSpy).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'auto' }),
      );
    } finally {
      scrollIntoViewSpy.mockRestore();
      window.matchMedia = originalMatchMedia;
    }
  });
});
