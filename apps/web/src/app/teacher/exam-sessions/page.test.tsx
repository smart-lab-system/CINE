import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ExamSessionsListPage from './page';

// QA-reported gap: "Tạo filter cho cả trang quản lý kỳ thi và bài thu" —
// this page previously took only page/pageSize. This page had no test
// coverage at all before (no page.test.tsx existed); mocks the hook
// (CLAUDE.md's frontend rule 1) the same way admin/accounts/page.test.tsx
// does. The debounce (useDebouncedValue) is the REAL hook, not mocked —
// asserted with `waitFor`'s real-timer polling rather than faking timers,
// since nothing else in this codebase fakes timers for this hook either.
const useExamSessionsMock = vi.fn();
// Chế độ LỊCH có truy vấn riêng. Phải mock ở đây dù mặc định trang mở ra ở
// chế độ Bảng: hook của React chạy ở MỌI lượt render bất kể `enabled`, nên
// thiếu nó thì cả file đỏ với "is not a function" — không phải lỗi logic mà
// là lỗi factory mock thiếu một export.
const useExamSessionsInRangeMock = vi.fn();
// Hộp thoại huỷ phiên gọi mutate này (T-SES-11). `reset` phải là MỘT hàm ổn định qua các lượt render, như `reset` thật của TanStack (bind một lần
// trong MutationObserver): hộp thoại xoá lý do trong effect phụ thuộc `reset`, nên một `vi.fn()` mới mỗi lượt sẽ xoá lý do ngay sau mỗi lần gõ.
const cancelMutate = vi.fn();
const cancelReset = vi.fn();

vi.mock('@/hooks/useExamSession', () => ({
  useExamSessions: (...args: unknown[]) => useExamSessionsMock(...args),
  useExamSessionsInRange: (...args: unknown[]) => useExamSessionsInRangeMock(...args),
  // Hộp thoại huỷ phiên (render ở cuối trang) đọc hook này ngay cả khi đóng.
  useCancelExamSession: () => ({ mutate: cancelMutate, reset: cancelReset, isPending: false, isError: false, error: null }),
}));

// Bộ lọc LỚP đọc danh sách lớp của giảng viên, không đọc các phiên đã
// tải: một lớp chưa từng có phiên thi nào vẫn phải chọn được, nếu không
// thì bộ lọc chỉ trả lời được câu hỏi mà người dùng đã biết đáp án.
const useTeachingClassesMock = vi.fn();

vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: () => useTeachingClassesMock(),
}));

// Bộ lọc Năm học → Học kỳ DÙNG CHUNG (plan G1): trang đọc `useSemesterYearFilter`, hook đó đọc bảng học kỳ qua `useSemesters`. Mock chỉ cần
// điều khiển lựa chọn hiện tại và ghi nhận lời gọi — danh sách lựa chọn đến từ `semesters` của chính mock, KHÔNG từ các phiên đã tải
// (một kỳ không có phiên nào vẫn phải chọn được).
const useFilterMock = vi.fn();
const setYear = vi.fn();
const setSemester = vi.fn();
const clearSemester = vi.fn();

vi.mock('@/hooks/useSemesterYearFilter', () => ({
  useSemesterYearFilter: (...args: unknown[]) => useFilterMock(...args),
}));

const SEMESTERS = [
  { id: 's2', academicYearStart: 2026, term: 2, label: 'HK2 2026-2027' },
  { id: 's1', academicYearStart: 2026, term: 1, label: 'HK1 2026-2027' },
  { id: 'old', academicYearStart: 2025, term: 2, label: 'HK2 2025-2026' },
];

function filterState(selection = { academicYear: null as number | null, semesterId: null as string | null }) {
  const params: { semesterId?: string; academicYear?: number } = {};
  if (selection.semesterId !== null) params.semesterId = selection.semesterId;
  else if (selection.academicYear !== null) params.academicYear = selection.academicYear;
  return {
    semesters: SEMESTERS,
    isLoading: false,
    selection,
    setYear,
    setSemester,
    clear: clearSemester,
    params,
    matches: () => true,
  };
}

/** Phiên mà server trả cho giảng viên: nhãn lớp gộp, học kỳ của lớp theo khoá, và bản chụp nhãn học kỳ. */
const SEMESTER_SNAPSHOT = 'HK1 2026-2027';

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'Giữa kỳ Lập trình Web',
    code: 'ABC123',
    courseName: 'Lập trình Web',
    classLabel: 'Nhóm 01',
    roomName: 'Phòng máy 1',
    examType: 'GK',
    startTime: new Date(Date.now() - 60_000).toISOString(),
    endTime: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'active',
    semesterName: SEMESTER_SNAPSHOT,
    semesterId: 's1',
    academicYear: 2026,
    term: 1,
    ...overrides,
  };
}

beforeEach(() => {
  cancelMutate.mockReset();
  cancelReset.mockReset();
  setYear.mockReset();
  setSemester.mockReset();
  clearSemester.mockReset();
  useFilterMock.mockReset();
  // MẶC ĐỊNH "Tất cả" — không chọn hộ ai một kỳ (Review Focus 1).
  useFilterMock.mockReturnValue(filterState());
  useTeachingClassesMock.mockReset();
  // Một lớp là mặc định: ô lọc lớp bị ẩn, nên mọi test cũ không đổi hành vi.
  useTeachingClassesMock.mockReturnValue({
    data: [
      {
        id: 'k1',
        label: 'Nhóm 01',
        labelWithSemester: 'Nhóm 01 · HK1 2026-2027',
        courseName: 'CTDL&GT',
        semesterId: 's1',
        academicYear: 2026,
        term: 1,
        studentCount: 30,
      },
    ],
  });
  useExamSessionsMock.mockReset();
  useExamSessionsMock.mockReturnValue({
    data: { items: [session()], total: 1 },
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  });
  useExamSessionsInRangeMock.mockReset();
  useExamSessionsInRangeMock.mockReturnValue({
    data: { items: [], total: 0 },
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  });
  window.localStorage.clear();
});

describe('ExamSessionsListPage — filters', () => {
  it('calls the hook with the debounced search term, resetting to page 1', async () => {
    render(<ExamSessionsListPage />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm kiếm phiên thi' }), {
      target: { value: 'giữa kỳ' },
    });

    await waitFor(() =>
      expect(useExamSessionsMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'giữa kỳ', page: 1 }),
      ),
    );
  });

  it('does not send an empty-string search — undefined, so the API sees no filter at all', () => {
    render(<ExamSessionsListPage />);

    expect(useExamSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
    );
  });

  it('filters by status, resetting to page 1', () => {
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    fireEvent.click(screen.getByRole('option', { name: 'Đã kết thúc' }));

    expect(useExamSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', page: 1 }),
    );
  });

  it('filters by exam type', () => {
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo loại kỳ thi' }));
    fireEvent.click(screen.getByRole('option', { name: 'Cuối kỳ' }));

    expect(useExamSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ examType: 'CK', page: 1 }),
    );
  });

  it('shows a distinct empty state, with a clear-filters action, only once a filter is active', () => {
    // Học kỳ mặc định là "Tất cả" (beforeEach): tách riêng hai câu chuyện "chưa có phiên nào" và "kỳ này không có phiên nào" — xem test
    // ngay dưới.
    useExamSessionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    const { rerender } = render(<ExamSessionsListPage />);

    // No filter active — the true-empty state, with the "create" CTA.
    expect(screen.getByText('Chưa có phiên thi nào')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo loại kỳ thi' }));
    fireEvent.click(screen.getByRole('option', { name: 'Cuối kỳ' }));
    rerender(<ExamSessionsListPage />);

    expect(screen.getByText('Không tìm thấy phiên thi phù hợp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeInTheDocument();
  });

  it('Review Focus 1, 2: mặc định KHÔNG gửi tham số học kỳ nào; chọn kỳ thì gửi semesterId (khoá), không gửi chuỗi', () => {
    render(<ExamSessionsListPage />);
    const first = useExamSessionsMock.mock.calls.at(-1)?.[0];
    // "Tất cả học kỳ" là KHÔNG gửi tham số, không phải `semesterId: undefined`-hay-chuỗi-rỗng: openapi-fetch serialize chúng thành
    // `?semesterId=` và `@IsUUID` ở backend trả 400.
    expect(first).not.toHaveProperty('semesterId');
    expect(first).not.toHaveProperty('academicYear');
    expect(first).not.toHaveProperty('semesterName');

    useFilterMock.mockReturnValue(filterState({ academicYear: 2026, semesterId: 's2' }));
    render(<ExamSessionsListPage />);
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ semesterId: 's2' }));
  });

  it('chỉ chọn NĂM học thì gửi academicYear (cả ba kỳ của năm đó)', () => {
    useFilterMock.mockReturnValue(filterState({ academicYear: 2026, semesterId: null }));
    render(<ExamSessionsListPage />);
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ academicYear: 2026 }));
    expect(useExamSessionsMock.mock.calls.at(-1)?.[0]).not.toHaveProperty('semesterId');
  });

  it('Review Focus 7: truy vấn LỊCH đi kèm cùng bộ lọc học kỳ', () => {
    useFilterMock.mockReturnValue(filterState({ academicYear: 2026, semesterId: 's2' }));
    render(<ExamSessionsListPage />);
    expect(useExamSessionsInRangeMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ semesterId: 's2' }));
  });

  it('Review Focus 4, 5: chọn học kỳ khác — kỳ KHÔNG có phiên nào trên trang vẫn chọn được — rồi quay về trang 1', () => {
    // Một phiên duy nhất trong `items`, mà ô kỳ vẫn liệt kê cả "HK2 2025-2026": danh sách lấy từ bảng học kỳ chứ không từ các dòng đã
    // tải — đúng tình huống bản cũ làm sai, khi nó suy danh sách từ trang đang xem nên kỳ cũ biến mất khỏi dropdown.
    useExamSessionsMock.mockReturnValue({
      data: { items: [session()], total: 2 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'HK2 2025-2026' }));

    expect(setSemester).toHaveBeenCalledWith('old');
    // Trang phải reset: đang ở trang 3 của kỳ này rồi đổi kỳ sẽ rơi vào một trang 3 không tồn tại của kỳ kia, và bảng hiện ra rỗng.
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('chọn năm học gọi setYear và quay về trang 1', () => {
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    fireEvent.click(screen.getByRole('option', { name: '2025-2026' }));

    expect(setYear).toHaveBeenCalledWith(2025);
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('kỳ rỗng nói khác "chưa có phiên thi nào", và mở được đường sang tất cả học kỳ', () => {
    // Hai câu chuyện khác nhau, không được nói chung một câu: "bạn chưa tạo phiên nào bao giờ" cần nút Tạo, còn "kỳ này bạn không có
    // phiên" chỉ cần đổi bộ lọc — cùng khuôn với "Lớp của tôi".
    useFilterMock.mockReturnValue(filterState({ academicYear: 2026, semesterId: 's1' }));
    useExamSessionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<ExamSessionsListPage />);

    expect(screen.getByText('Không có phiên thi nào trong học kỳ này')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có phiên thi nào')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả học kỳ' }));
    expect(clearSemester).toHaveBeenCalled();
  });

  it('Review Focus 3: cột Lớp hiện nhãn gộp `classLabel`, không phải `undefined`', () => {
    render(<ExamSessionsListPage />);
    expect(within(screen.getByRole('row', { name: /Giữa kỳ Lập trình Web/ })).getByText('Nhóm 01')).toBeInTheDocument();
  });

  // Các ca "quay về trang 1" ở trên khởi đầu từ trang 1 nên KHÔNG thể đỏ khi bỏ `setPage(1)` (đã kiểm bằng đột biến): bộ ba này đi sang
  // trang 2 TRƯỚC rồi mới đổi phạm vi học kỳ — trang 2 của phạm vi này có thể không tồn tại ở phạm vi kia, và bảng hiện ra rỗng như thể
  // không có phiên nào (Review Focus 5).
  describe('Review Focus 5: đổi phạm vi học kỳ khi đang ở trang 2 thì về trang 1', () => {
    function manyPages() {
      useExamSessionsMock.mockReturnValue({
        data: { items: [session()], total: 45 },
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      });
    }
    function goToPage2() {
      fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
      expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    }

    it('đổi NĂM học', () => {
      manyPages();
      render(<ExamSessionsListPage />);
      goToPage2();

      fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
      fireEvent.click(screen.getByRole('option', { name: '2025-2026' }));

      expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    });

    it('đổi HỌC KỲ', () => {
      manyPages();
      render(<ExamSessionsListPage />);
      goToPage2();

      fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
      fireEvent.click(screen.getByRole('option', { name: 'HK2 2025-2026' }));

      expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    });

    it('"Xem tất cả học kỳ" ở màn trống', () => {
      manyPages();
      const view = render(<ExamSessionsListPage />);
      goToPage2();

      // Trang 2 của kỳ này rỗng (kỳ đã lọc không có phiên): màn trống có nút thoát ra "tất cả học kỳ".
      useFilterMock.mockReturnValue(filterState({ academicYear: 2026, semesterId: 's1' }));
      useExamSessionsMock.mockReturnValue({ data: { items: [], total: 0 }, error: null, isLoading: false, refetch: vi.fn() });
      view.rerender(<ExamSessionsListPage />);
      fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả học kỳ' }));

      expect(clearSemester).toHaveBeenCalled();
      expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    });
  });

  it('một lớp thì KHÔNG hiện ô lọc lớp', () => {
    // Cùng luật với Phòng và Loại kỳ thi ở màn Bài thu: một lựa chọn là
    // nhiễu. Học kỳ cố ý KHÔNG theo luật này — nó là chiều thời gian mà
    // giảng viên đang đứng trong đó, và ô ấy là chỗ duy nhất nói ra rằng
    // trang đang bị hẹp về một kỳ.
    render(<ExamSessionsListPage />);

    expect(screen.queryByRole('combobox', { name: 'Lọc theo lớp' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toBeInTheDocument();
  });

  it('từ hai lớp trở lên thì lọc được, gửi classId lên API và quay về trang 1', () => {
    useTeachingClassesMock.mockReturnValue({
      data: [
        { id: 'k1', label: 'Nhóm 01', labelWithSemester: 'Nhóm 01 · HK1 2026-2027', courseName: 'CTDL&GT', semesterId: 's1', academicYear: 2026, term: 1, studentCount: 30 },
        { id: 'k2', label: 'Nhóm 02', labelWithSemester: 'Nhóm 02 · HK1 2026-2027', courseName: 'CTDL&GT', semesterId: 's1', academicYear: 2026, term: 1, studentCount: 28 },
      ],
    });
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo lớp' }));
    fireEvent.click(screen.getByRole('option', { name: 'Nhóm 02 · HK1 2026-2027' }));

    // ID chứ không phải tên: hai lớp trùng tên hiển thị vẫn là hai lớp.
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: 'k2', page: 1 }),
    );
  });

  it('"tất cả lớp" gửi undefined, không gửi chuỗi rỗng', () => {
    useTeachingClassesMock.mockReturnValue({
      data: [
        { id: 'k1', label: 'Nhóm 01', labelWithSemester: 'Nhóm 01 · HK1 2026-2027', courseName: 'CTDL&GT', semesterId: 's1', academicYear: 2026, term: 1, studentCount: 30 },
        { id: 'k2', label: 'Nhóm 02', labelWithSemester: 'Nhóm 02 · HK1 2026-2027', courseName: 'CTDL&GT', semesterId: 's1', academicYear: 2026, term: 1, studentCount: 28 },
      ],
    });
    render(<ExamSessionsListPage />);

    // Cùng lý do với semesterName: openapi-fetch serialize chuỗi rỗng thành
    // `?classId=` và @IsUUID ở backend sẽ trả 400 cho nó.
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: undefined }),
    );
  });

  it('"Xoá bộ lọc" trả cả bộ lọc LỚP về mặc định', () => {
    // Ca "Xoá bộ lọc" bên dưới chạy với mock một lớp, nên ô lọc lớp không
    // hề hiện ra và nó không chứng minh được gì về classId. Cần một ca
    // riêng có đủ hai lớp, nếu không thì một lần `clearFilters()` quên
    // `setClassId` sẽ lọt qua cả bộ test.
    useTeachingClassesMock.mockReturnValue({
      data: [
        { id: 'k1', label: 'Nhóm 01', labelWithSemester: 'Nhóm 01 · HK1 2026-2027', courseName: 'CTDL&GT', semesterId: 's1', academicYear: 2026, term: 1, studentCount: 30 },
        { id: 'k2', label: 'Nhóm 02', labelWithSemester: 'Nhóm 02 · HK1 2026-2027', courseName: 'CTDL&GT', semesterId: 's1', academicYear: 2026, term: 1, studentCount: 28 },
      ],
    });
    useExamSessionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo lớp' }));
    fireEvent.click(screen.getByRole('option', { name: 'Nhóm 02 · HK1 2026-2027' }));
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: 'k2' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: undefined, page: 1 }),
    );
  });

  it('"Xoá bộ lọc" resets every filter back to its default', () => {
    useExamSessionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo loại kỳ thi' }));
    fireEvent.click(screen.getByRole('option', { name: 'Cuối kỳ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    expect(useExamSessionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: undefined,
        status: undefined,
        examType: undefined,
        page: 1,
      }),
    );
    // Học kỳ là PHẠM VI đang xem, không phải một filter trong phạm vi đó —
    // "Xoá bộ lọc" cố ý không đụng tới nó, giống nút cùng tên ở FilterRail
    // của trang Bài thu. Lối ra khỏi một học kỳ là chính dropdown đó.
    expect(clearSemester).not.toHaveBeenCalled();
    expect(setSemester).not.toHaveBeenCalled();
  });
});

describe('ExamSessionsListPage — chế độ xem lịch', () => {
  function switchToCalendar() {
    render(<ExamSessionsListPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Lịch' }));
  }

  it('bật chế độ lịch thì gửi khoảng ĐÚNG MỘT TUẦN, nửa mở', async () => {
    switchToCalendar();

    await waitFor(() => {
      const call = useExamSessionsInRangeMock.mock.calls.at(-1)?.[0];
      expect(call.from).toBeDefined();
      expect(call.to).toBeDefined();
      // Bảy ngày chẵn. Sai số ở đây là lỗi lệch-một-ngày, và nó cho ra một
      // cái lịch trông hoàn toàn bình thường nhưng thiếu hoặc thừa một ngày.
      const span = Date.parse(call.to) - Date.parse(call.from);
      expect(span).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  it('truy vấn lịch chỉ CHẠY khi đang ở chế độ lịch', () => {
    render(<ExamSessionsListPage />);
    // Mặc định là Bảng: hook vẫn được gọi (hook của React luôn chạy) nhưng
    // phải bị tắt, nếu không mỗi lần mở trang danh sách là một request thừa.
    expect(useExamSessionsInRangeMock.mock.calls.at(-1)?.[1]).toEqual({ enabled: false });

    fireEvent.click(screen.getByRole('button', { name: 'Lịch' }));
    expect(useExamSessionsInRangeMock.mock.calls.at(-1)?.[1]).toEqual({ enabled: true });
  });

  it('"Tuần sau" dời khoảng đi đúng 7 ngày', async () => {
    switchToCalendar();
    const before = useExamSessionsInRangeMock.mock.calls.at(-1)?.[0].from;

    fireEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));

    await waitFor(() => {
      const after = useExamSessionsInRangeMock.mock.calls.at(-1)?.[0].from;
      expect(Date.parse(after) - Date.parse(before)).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  it('bộ lọc đang bật vẫn đi kèm truy vấn lịch', async () => {
    render(<ExamSessionsListPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Lịch' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm kiếm phiên thi' }), {
      target: { value: 'giữa kỳ' },
    });

    await waitFor(() => {
      expect(useExamSessionsInRangeMock.mock.calls.at(-1)?.[0].search).toBe('giữa kỳ');
    });
  });

  it('mỗi thẻ mang NHÃN CHỮ trạng thái, không chỉ dựa vào màu', async () => {
    useExamSessionsInRangeMock.mockReturnValue({
      data: { items: [session()], total: 1 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    switchToCalendar();

    // Khoanh vào trong LƯỚI: chuỗi "Đang diễn ra" cũng có ở chú giải dưới
    // chân, nên tìm trên toàn trang sẽ khớp hai chỗ và test đỏ vì lý do
    // không liên quan tới thứ đang kiểm.
    const grid = await screen.findByRole('table');
    expect(within(grid).getByText('Đang diễn ra')).toBeInTheDocument();
    expect(within(grid).getByText('Giữa kỳ Lập trình Web')).toBeInTheDocument();
  });

  it('hai phiên cách nhau dưới 30 phút được gắn cờ ngay trên thẻ', async () => {
    const day = new Date();
    day.setHours(8, 0, 0, 0);
    const at = (h: number, m: number) => {
      const d = new Date(day);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };
    useExamSessionsInRangeMock.mockReturnValue({
      data: {
        items: [
          session({ id: 'a', name: 'Ca đầu', status: 'scheduled', startTime: at(8, 0), endTime: at(10, 0) }),
          session({ id: 'b', name: 'Ca sát nút', status: 'scheduled', startTime: at(10, 15), endTime: at(12, 0) }),
        ],
        total: 2,
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    switchToCalendar();

    expect(await screen.findByText(/Cách phiên trước 15 phút/)).toBeInTheDocument();
  });
});

describe('ExamSessionsListPage — Sửa và Huỷ phiên (T-SES-11)', () => {
  const NAME = 'Giữa kỳ Lập trình Web';
  const upcoming = (over: Record<string, unknown> = {}) =>
    session({
      startTime: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      endTime: new Date(Date.now() + 4 * 3_600_000).toISOString(),
      ...over,
    });
  const show = (item: Record<string, unknown>) =>
    useExamSessionsMock.mockReturnValue({ data: { items: [item], total: 1 }, error: null, isLoading: false, refetch: vi.fn() });

  it('phiên chưa bắt đầu: "Sửa" dẫn tới trang sửa; "Huỷ phiên" mở hộp thoại, "Giữ phiên" đóng lại mà không huỷ gì', () => {
    show(upcoming());
    render(<ExamSessionsListPage />);
    expect(screen.getByRole('link', { name: `Sửa phiên ${NAME}` })).toHaveAttribute('href', '/teacher/exam-sessions/s1/edit');
    fireEvent.click(screen.getByRole('button', { name: `Huỷ phiên ${NAME}` }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Huỷ phiên thi?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Giữ phiên' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(cancelMutate).not.toHaveBeenCalled();
  });

  it('Review Focus 5: phiên đã bắt đầu (mặc định của fixture) — "Sửa" không bấm được và nói vì sao, "Huỷ phiên" vẫn bật', () => {
    render(<ExamSessionsListPage />);
    const edit = screen.getByRole('button', { name: `Sửa phiên ${NAME}` });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(edit).toHaveAccessibleDescription('Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.');
    expect(screen.queryByRole('link', { name: `Sửa phiên ${NAME}` })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Huỷ phiên ${NAME}` })).not.toHaveAttribute('aria-disabled');
  });

  it('phiên đã huỷ hay đã kết thúc: cả hai nút bị chặn', () => {
    show(upcoming({ status: 'cancelled' }));
    render(<ExamSessionsListPage />);
    expect(screen.getByRole('button', { name: `Sửa phiên ${NAME}` })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: `Huỷ phiên ${NAME}` })).toHaveAttribute('aria-disabled', 'true');
  });

  it('xác nhận huỷ gọi API với id phiên và lý do đã nhập', () => {
    show(upcoming());
    render(<ExamSessionsListPage />);
    fireEvent.click(screen.getByRole('button', { name: `Huỷ phiên ${NAME}` }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Lý do/), { target: { value: 'Nhầm phòng' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ phiên' }));
    expect(cancelMutate).toHaveBeenCalledWith({ id: 's1', reason: 'Nhầm phòng' }, expect.any(Object));
  });
});
