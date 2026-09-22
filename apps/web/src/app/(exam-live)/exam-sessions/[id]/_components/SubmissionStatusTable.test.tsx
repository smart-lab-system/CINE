import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SubmissionStatusTable } from './SubmissionStatusTable';
import type { DeliverableColumn, SubmissionRowStudent } from '@/lib/submission-rows';
import { scrollportsAbove } from '@/test-utils/scrollports';

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

describe('SubmissionStatusTable — gradingByMssv', () => {
  const deliverables = [{ id: 'd1', requiredFilename: 'Cau1.docx' }];
  const student: SubmissionRowStudent = {
    studentMssv: 'A1',
    fullName: 'SV A1',
    byDeliverable: { d1: { state: 'collected', downloadUrl: 'https://x.test/f' } },
  };
  const otherStudent: SubmissionRowStudent = {
    studentMssv: 'B2',
    fullName: 'SV B2',
    byDeliverable: { d1: { state: 'collected', downloadUrl: 'https://x.test/g' } },
  };

  it('vắng prop: dialog không nói gì về điểm, không có nút Chấm lại', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[student]}
        focusStudentMssv="A1"
      />,
    );
    expect(screen.queryByText(/Điểm AI/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chấm lại/ })).not.toBeInTheDocument();
  });

  it('bài chưa chấm: không hiện điểm, không hiện nút Chấm lại', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[student]}
        focusStudentMssv="A1"
        gradingByMssv={{}}
      />,
    );
    expect(screen.queryByText(/Điểm AI/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chấm lại/ })).not.toBeInTheDocument();
  });

  it('bài đã chấm: hiện điểm chỉ-đọc và nút Chấm lại DISABLED kèm lý do', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[student]}
        focusStudentMssv="A1"
        gradingByMssv={{ A1: { score: 8.5, status: 'ai_graded' } }}
      />,
    );
    expect(screen.getByText('Điểm AI: 8.5')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Chấm lại/ });
    expect(button).toBeDisabled();
    expect(screen.getByText('Có khi module chấm điểm hoàn thiện')).toBeInTheDocument();
  });

  // Review round 1 (Important): every test above uses exactly ONE student,
  // so a lookup bug that ignores the key entirely — e.g.
  // `Object.values(gradingByMssv ?? {})[0]` instead of
  // `gradingByMssv?.[selectedStudent.studentMssv]` — would still pass all
  // three. In a grading UI, showing one student's score on another
  // student's dialog is a real-consequence bug, not a cosmetic one, so this
  // pins the lookup in BOTH directions with two students and two distinct
  // scores. B2's entry is listed FIRST on purpose: `Object.values(...)[0]`
  // would then resolve to B2's record even though A1's dialog is the one
  // open, which is exactly the failure mode this test must catch.
  it('mở dialog của A1 thì hiện đúng điểm của A1, không lẫn điểm của B2', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[student, otherStudent]}
        focusStudentMssv="A1"
        gradingByMssv={{
          B2: { score: 3, status: 'ai_graded' },
          A1: { score: 8.5, status: 'ai_graded' },
        }}
      />,
    );
    expect(screen.getByText('Điểm AI: 8.5')).toBeInTheDocument();
    expect(screen.queryByText('Điểm AI: 3')).not.toBeInTheDocument();
  });

  // Minor 1: `aiTotalScore` (mapped to `score` here) is nullable for a real
  // state — a result row exists (status `ai_grading`) before a score is
  // written. The render falls back to '—' via `grade.score ?? '—'`; this
  // pins that fallback actually fires instead of e.g. printing "null".
  it('điểm null (đang chấm dở) hiện gạch ngang thay vì "null"', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[student]}
        focusStudentMssv="A1"
        gradingByMssv={{ A1: { score: null, status: 'ai_grading' } }}
      />,
    );
    expect(screen.getByText('Điểm AI: —')).toBeInTheDocument();
  });
});

// Task 10 (archive-content-validation) — bảng §7 của spec
// 2026-09-21-archive-content-validation-design.md. Hiện THẲNG trong ô của
// ma trận, không giấu sau cú bấm "Xem bài nộp": đó là quyết định spec §9.2
// nêu tường minh, và test dưới đây khẳng định đúng chỗ đó — không mở dialog
// nào cả trước khi đọc được các dòng chữ này.
describe('SubmissionStatusTable — kiểm file nén', () => {
  const deliverables: DeliverableColumn[] = [{ id: 'd1', requiredFilename: 'BaiThi.zip' }];

  function studentWith(archive: {
    archiveCheckStatus: 'not_applicable' | 'pending' | 'passed' | 'failed' | 'unreadable';
    archiveMissingEntries?: string[] | null;
    archiveCheckError?: string | null;
  }): SubmissionRowStudent {
    return {
      studentMssv: 'SV001',
      fullName: 'Nguyễn Văn A',
      byDeliverable: {
        d1: { state: 'collected', downloadUrl: 'https://storage.example/f', ...archive },
      },
    };
  }

  it('not_applicable — không hiện gì thêm về file nén', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[studentWith({ archiveCheckStatus: 'not_applicable' })]}
      />,
    );
    expect(screen.queryByText(/Đang kiểm|Thiếu:|Không mở được|Đủ nội dung/)).not.toBeInTheDocument();
  });

  it('pending — hiện "Đang kiểm", không để trống', () => {
    // Ô trống lúc chờ trông giống hệt một bài đã kiểm và đạt — spec §7.
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[studentWith({ archiveCheckStatus: 'pending' })]}
      />,
    );
    expect(screen.getByText('Đang kiểm')).toBeInTheDocument();
  });

  it('passed — hiện dấu đủ', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[studentWith({ archiveCheckStatus: 'passed' })]}
      />,
    );
    expect(screen.getByText('Đủ nội dung')).toBeInTheDocument();
  });

  it('failed — liệt kê thẳng tên file thiếu ngay trong ô, không cần bấm gì', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[
          studentWith({
            archiveCheckStatus: 'failed',
            archiveMissingEntries: ['Main.java', 'BaoCao.docx'],
          }),
        ]}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Main\.java/)).toBeInTheDocument();
    expect(screen.getByText(/BaoCao\.docx/)).toBeInTheDocument();
  });

  it('unreadable — hiện lý do thật, không chỉ chữ "hỏng"', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[
          studentWith({
            archiveCheckStatus: 'unreadable',
            archiveCheckError: 'File quá lớn để mở ra kiểm (300000000 byte, trần 209715200).',
          }),
        ]}
      />,
    );
    expect(screen.getByText(/quá lớn để mở ra kiểm/)).toBeInTheDocument();
  });

  it('không có trường archiveCheckStatus (dữ liệu cũ/test khác) thì không vỡ, không hiện gì', () => {
    render(
      <SubmissionStatusTable
        deliverables={deliverables}
        students={[
          {
            studentMssv: 'SV002',
            fullName: 'Trần Thị B',
            byDeliverable: { d1: { state: 'collected' } },
          },
        ]}
      />,
    );
    expect(screen.queryByText(/Đang kiểm|Thiếu:|Không mở được|Đủ nội dung/)).not.toBeInTheDocument();
  });
});

/**
 * Bố cục: bảng này từng nằm trong HAI div `overflow-x-auto` lồng nhau —
 * một do component tự bọc, một do primitive `Table` luôn bọc. Hai
 * scrollport lồng nhau không chỉ dư: cái trong cùng là cái mà `sticky`
 * của `<thead>` giải theo, và nó cao tự do, nên header không bao giờ
 * dính. Xem `components/ui/table.test.tsx` cho quy tắc CSS đứng sau.
 *
 * jsdom không tính layout, nên "dính thật" không kiểm được ở đây; cái
 * kiểm được là hai điều kiện khiến nó dính hay không: chỉ MỘT scrollport,
 * và trần chiều cao nằm đúng trên scrollport đó.
 */
describe('SubmissionStatusTable — vùng cuộn', () => {
  const cols: DeliverableColumn[] = [
    { id: 'd1', requiredFilename: 'bai1.c' },
    { id: 'd2', requiredFilename: 'bai2.c' },
  ];

  const rows: SubmissionRowStudent[] = [
    {
      studentMssv: '2111001',
      fullName: 'Nguyễn Văn A',
      byDeliverable: { d1: { state: 'collected' }, d2: { state: 'collected' } },
    },
    { studentMssv: '2111002', fullName: 'Trần Thị B', byDeliverable: { d1: { state: 'collected' } } },
  ];

  it('bọc bảng trong đúng MỘT scrollport, không phải hai div lồng nhau', () => {
    render(<SubmissionStatusTable deliverables={cols} students={rows} />);

    // Nếu con số này thành 2, header dính sẽ hỏng — đây chính là hồi quy
    // mà test này canh.
    expect(scrollportsAbove(screen.getByRole('table'))).toHaveLength(1);
  });

  it('đặt trần chiều cao trên chính scrollport đó, và cho focus bằng bàn phím', () => {
    render(<SubmissionStatusTable deliverables={cols} students={rows} />);

    const [scrollport] = scrollportsAbove(screen.getByRole('table'));
    expect(scrollport.className).toContain('overflow-y-auto');
    expect(scrollport.className).toMatch(/max-h-\[/);
    expect(scrollport).toHaveAttribute('tabindex', '0');
    expect(scrollport).toHaveAccessibleName();
  });

  it('ghim header bảng, kèm đường kẻ dưới không do border-collapse vẽ', () => {
    render(<SubmissionStatusTable deliverables={cols} students={rows} />);

    const head = screen.getByRole('table').querySelector('thead') as HTMLElement;
    expect(head.className).toContain('sticky');
    expect(head.className).toContain('top-0');

    // Opaque, and this is worth pinning: the house style for header bands
    // on this very page is `bg-surface-2/60` (see the two CardHeaders and
    // ExamMaterialsCard). A stuck header at 60% opacity shows the rows
    // sliding through it, and nothing else would fail if it happened.
    expect(head.className).toMatch(/\bbg-surface-2\b/);
    expect(head.className).not.toMatch(/bg-surface-2\//);

    // `border-collapse: collapse` (mặc định của primitive Table) không vẽ
    // border của hàng dính khi cuộn — border thuộc về table, không thuộc
    // về `<tr>`. Nên đường kẻ dưới header phải đến từ shadow trên `<th>`,
    // nếu không header dính sẽ trông như đè lên dòng đầu tiên.
    const th = head.querySelector('th') as HTMLElement;
    expect(th.className).toMatch(/shadow-\[inset/);
  });

  it('không dựng vùng cuộn khi chưa có dòng nào để cuộn', () => {
    render(<SubmissionStatusTable deliverables={cols} students={[]} />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Chưa có bài nộp nào')).toBeInTheDocument();
  });
});
