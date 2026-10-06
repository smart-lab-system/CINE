import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AdminClassesPage from './page';

const useAdminClassesMock = vi.fn();
const useCatalogMock = vi.fn();
const useTeachersMock = vi.fn();
const useFilterMock = vi.fn();
const mutation = () => ({ mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() });
const create = mutation();
const update = mutation();
const remove = mutation();

vi.mock('@/hooks/useAdminClasses', () => ({
  useAdminClasses: (...args: unknown[]) => useAdminClassesMock(...args),
  useCreateAdminClass: () => create,
  useUpdateAdminClass: () => update,
  useDeleteAdminClass: () => remove,
}));
vi.mock('@/hooks/useAdministrativeClasses', () => ({ useAdministrativeClasses: () => useCatalogMock() }));
vi.mock('@/hooks/useTeacherOptions', () => ({ useTeacherOptions: () => useTeachersMock() }));
vi.mock('@/hooks/useSemesterYearFilter', () => ({ useSemesterYearFilter: (...args: unknown[]) => useFilterMock(...args) }));
vi.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: (value: unknown) => value }));
vi.mock('@/components/import/import-dialog', () => ({
  ImportDialog: ({ kind }: { kind: { id: string } }) => <button type="button">Nhập từ file ({kind.id})</button>,
}));
vi.mock('./_components/administrative-class-catalog-dialog', () => ({
  AdministrativeClassCatalogDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Danh mục lớp danh nghĩa (giả)" /> : null,
}));

const SEMESTERS = [
  { id: 's2', academicYearStart: 2026, term: 2, label: 'HK2 2026-2027' },
  { id: 's1', academicYearStart: 2026, term: 1, label: 'HK1 2026-2027' },
];
const filterState = (overrides: Record<string, unknown> = {}) => ({
  semesters: SEMESTERS,
  isLoading: false,
  selection: { academicYear: null, semesterId: null },
  setYear: vi.fn(),
  setSemester: vi.fn(),
  clear: vi.fn(),
  params: {},
  matches: () => true,
  ...overrides,
});

const klass = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  label: 'DHKTPM18A – Nhóm 1',
  labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
  semesterId: 's1',
  academicYear: 2026,
  term: 1,
  administrativeClassId: 'a1',
  administrativeClassCode: 'DHKTPM18A',
  groupName: 'Nhóm 1',
  teacherId: 't1',
  teacherName: 'GV A',
  studentCount: 40,
  sessionCount: 0,
  ...overrides,
});

function load(rows: ReturnType<typeof klass>[]) {
  useAdminClassesMock.mockReturnValue({ data: rows, isLoading: false, error: null });
}

describe('Trang Lớp (admin)', () => {
  beforeEach(() => {
    [create, update, remove].forEach((m) => {
      m.mutateAsync.mockReset().mockResolvedValue({});
      m.reset.mockReset();
      m.error = null;
    });
    useAdminClassesMock.mockReset();
    useFilterMock.mockReset().mockReturnValue(filterState());
    useCatalogMock.mockReset().mockReturnValue({ data: [{ id: 'a1', code: 'DHKTPM18A', classCount: 1 }, { id: 'a2', code: 'DHKTPM18B', classCount: 0 }], isLoading: false, error: null });
    useTeachersMock.mockReset().mockReturnValue({ data: [{ id: 't1', name: 'GV A' }, { id: 't2', name: 'GV B' }], isLoading: false, error: null });
    load([klass()]);
  });

  it('hiện nhãn lớp, học kỳ, giảng viên, sĩ số, số phiên; "chưa có" cho lớp chưa có sinh viên', () => {
    load([klass(), klass({ id: 'c2', label: 'DHKTPM18B', groupName: '', studentCount: 0, sessionCount: 2, teacherName: 'GV B' })]);
    render(<AdminClassesPage />);

    const first = screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ });
    expect(first).toHaveTextContent('HK1 2026-2027');
    expect(first).toHaveTextContent('GV A');
    expect(first).toHaveTextContent('40');

    const second = screen.getByRole('row', { name: /DHKTPM18B/ });
    expect(second).toHaveTextContent('chưa có');
    expect(second).toHaveTextContent('2');
  });

  it('lớp cũ chưa có học kỳ hiện "Chưa gán học kỳ" thay vì "HK null"', () => {
    load([klass({ semesterId: null, academicYear: null, term: null })]);
    render(<AdminClassesPage />);
    expect(screen.getByText('Chưa gán học kỳ')).toBeInTheDocument();
  });

  it('có hai nút trên đầu trang: nhập từ file và Danh mục lớp danh nghĩa', () => {
    render(<AdminClassesPage />);
    expect(screen.getByRole('button', { name: 'Nhập từ file (class)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Danh mục lớp danh nghĩa' }));
    expect(screen.getByRole('dialog', { name: 'Danh mục lớp danh nghĩa (giả)' })).toBeInTheDocument();
  });

  describe('bộ lọc', () => {
    it('đưa tham số của bộ lọc năm học → học kỳ, giảng viên và ô tìm vào truy vấn phía server', async () => {
      useFilterMock.mockReturnValue(filterState({ params: { semesterId: 's1' } }));
      render(<AdminClassesPage />);
      expect(useAdminClassesMock).toHaveBeenLastCalledWith({ semesterId: 's1' });

      fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo giảng viên' }));
      fireEvent.click(screen.getByRole('option', { name: 'GV B' }));
      await waitFor(() => expect(useAdminClassesMock).toHaveBeenLastCalledWith({ semesterId: 's1', teacherId: 't2' }));

      fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm mã lớp' }), { target: { value: ' DHKTPM ' } });
      await waitFor(() =>
        expect(useAdminClassesMock).toHaveBeenLastCalledWith({ semesterId: 's1', teacherId: 't2', q: 'DHKTPM' }),
      );
    });

    it('mặc định không lọc gì: truy vấn rỗng (Tất cả)', () => {
      render(<AdminClassesPage />);
      expect(useAdminClassesMock).toHaveBeenLastCalledWith({});
    });

    it('rỗng vì lọc nói khác với rỗng vì chưa có lớp', () => {
      load([]);
      const { unmount } = render(<AdminClassesPage />);
      expect(screen.getByText('Chưa có lớp nào')).toBeInTheDocument();
      unmount();

      useFilterMock.mockReturnValue(filterState({ selection: { academicYear: 2026, semesterId: null }, params: { academicYear: 2026 } }));
      render(<AdminClassesPage />);
      expect(screen.getByText('Không có lớp nào khớp bộ lọc')).toBeInTheDocument();
    });
  });

  describe('thêm lớp (Review Focus 3, 6)', () => {
    it('Final I2: chưa lọc kỳ nào thì KHÔNG chọn sẵn học kỳ (admin chọn có chủ ý); nút Tạo tắt cho tới khi chọn đủ học kỳ, lớp danh nghĩa và giảng viên', async () => {
      // Chọn sẵn kỳ "mới nhất" là cái bẫy: một năm có ba kỳ thì mới nhất là HK3 hè, và học kỳ của lớp gần như không đổi được sau khi có phiên thi
      // (phiên chụp nhãn học kỳ lên bảng điểm). Ô bắt buộc nên buộc chọn, còn nếu đang lọc một kỳ thì kỳ đó đã là ý đồ rõ ràng (ca kế tiếp).
      render(<AdminClassesPage />);

      fireEvent.click(screen.getByRole('button', { name: /thêm lớp/i }));
      expect(create.reset).toHaveBeenCalled(); // Review Focus 2
      const dialog = screen.getByRole('dialog', { name: 'Thêm lớp' });
      const semesterBox = within(dialog).getByRole('combobox', { name: 'Học kỳ' });
      expect(semesterBox).toHaveTextContent('Chọn học kỳ');
      expect(semesterBox).not.toHaveTextContent('HK2 2026-2027');
      const submit = within(dialog).getByRole('button', { name: 'Tạo' });
      expect(submit).toBeDisabled();

      fireEvent.click(semesterBox);
      fireEvent.click(screen.getByRole('option', { name: 'HK2 2026-2027' }));
      expect(submit).toBeDisabled(); // còn thiếu lớp danh nghĩa và giảng viên

      fireEvent.click(within(dialog).getByRole('combobox', { name: 'Lớp danh nghĩa' }));
      fireEvent.click(screen.getByRole('option', { name: /DHKTPM18B/ }));
      expect(submit).toBeDisabled(); // còn thiếu giảng viên
      fireEvent.click(within(dialog).getByRole('combobox', { name: 'Giảng viên phụ trách' }));
      fireEvent.click(screen.getByRole('option', { name: 'GV B' }));
      fireEvent.change(within(dialog).getByLabelText(/Nhóm/), { target: { value: ' Nhóm 2 ' } });
      expect(submit).toBeEnabled();
      fireEvent.click(submit);

      await waitFor(() =>
        expect(create.mutateAsync).toHaveBeenCalledWith({
          semesterId: 's2',
          administrativeClassId: 'a2',
          groupName: 'Nhóm 2',
          teacherId: 't2',
        }),
      );
    });

    it('đang lọc một học kỳ thì form mở với đúng học kỳ đó', () => {
      useFilterMock.mockReturnValue(filterState({ selection: { academicYear: 2026, semesterId: 's1' }, params: { semesterId: 's1' } }));
      render(<AdminClassesPage />);
      fireEvent.click(screen.getByRole('button', { name: /thêm lớp/i }));
      expect(within(screen.getByRole('dialog', { name: 'Thêm lớp' })).getByRole('combobox', { name: 'Học kỳ' })).toHaveTextContent('HK1 2026-2027');
    });

    it('Review Focus 6: Danh mục TRỐNG — lời chỉ đường nguyên văn spec và nút mở Danh mục', () => {
      useCatalogMock.mockReturnValue({ data: [], isLoading: false, error: null });
      render(<AdminClassesPage />);

      fireEvent.click(screen.getByRole('button', { name: /thêm lớp/i }));
      const dialog = screen.getByRole('dialog', { name: 'Thêm lớp' });
      expect(
        within(dialog).getByText('Chưa có mã lớp danh nghĩa nào. Hãy thêm vào Danh mục lớp danh nghĩa trước.'),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Mở Danh mục lớp danh nghĩa' })).toBeInTheDocument();
    });

    it('chưa có học kỳ nào: lời chỉ đường kèm liên kết tới trang Học kỳ', () => {
      useFilterMock.mockReturnValue(filterState({ semesters: [] }));
      render(<AdminClassesPage />);

      fireEvent.click(screen.getByRole('button', { name: /thêm lớp/i }));
      const dialog = screen.getByRole('dialog', { name: 'Thêm lớp' });
      expect(within(dialog).getByText(/chưa có học kỳ nào/i)).toBeInTheDocument();
      expect(within(dialog).getByRole('link', { name: /trang học kỳ/i })).toHaveAttribute('href', '/admin/semesters');
    });
  });

  describe('sửa lớp', () => {
    it('lớp CHƯA có phiên: học kỳ sửa được', () => {
      render(<AdminClassesPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Sửa' }));
      expect(within(screen.getByRole('dialog', { name: 'Sửa lớp' })).getByRole('combobox', { name: 'Học kỳ' })).toBeEnabled();
    });

    it('Review Focus 3: lớp ĐÃ có phiên — học kỳ khoá kèm lý do; nhóm, lớp danh nghĩa và giảng viên vẫn sửa được', () => {
      load([klass({ sessionCount: 3 })]);
      render(<AdminClassesPage />);

      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Sửa' }));

      const dialog = screen.getByRole('dialog', { name: 'Sửa lớp' });
      expect(within(dialog).getByRole('combobox', { name: 'Học kỳ' })).toBeDisabled();
      expect(within(dialog).getByText(/đã có 3 phiên thi nên không đổi được học kỳ/i)).toBeInTheDocument();
      expect(within(dialog).getByRole('combobox', { name: 'Giảng viên phụ trách' })).toBeEnabled();
      expect(within(dialog).getByRole('combobox', { name: 'Lớp danh nghĩa' })).toBeEnabled();
    });

    it('Review Focus 5: chưa đổi gì thì không lưu được; đổi giảng viên thì CHỈ gửi teacherId', async () => {
      render(<AdminClassesPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Sửa' }));
      const dialog = screen.getByRole('dialog', { name: 'Sửa lớp' });
      const save = within(dialog).getByRole('button', { name: 'Lưu' });
      expect(save).toBeDisabled();

      fireEvent.click(within(dialog).getByRole('combobox', { name: 'Giảng viên phụ trách' }));
      fireEvent.click(screen.getByRole('option', { name: 'GV B' }));
      expect(save).toBeEnabled();
      fireEvent.click(save);

      await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'c1', body: { teacherId: 't2' } }));
    });

    it('đổi giảng viên: nói rõ điều gì xảy ra với phiên đã có', () => {
      render(<AdminClassesPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Sửa' }));
      expect(within(screen.getByRole('dialog', { name: 'Sửa lớp' })).getByText(/phiên thi đã có giữ giảng viên cũ/i)).toBeInTheDocument();
    });

    // Lớp cũ chưa backfill: `classFormOf` để trống học kỳ và lớp danh nghĩa. Đổi giảng viên một mình KHÔNG đủ để lưu — admin phải chọn nốt
    // hai ô đó, nếu không lớp mãi mang trạng thái nửa vời (`classFormComplete`, plan G2 Task 2).
    it('lớp cũ chưa có học kỳ và lớp danh nghĩa: chỉ lưu được khi đã chọn đủ cả hai', () => {
      load([klass({ semesterId: null, academicYear: null, term: null, administrativeClassId: null, administrativeClassCode: null })]);
      render(<AdminClassesPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Sửa' }));
      const dialog = screen.getByRole('dialog', { name: 'Sửa lớp' });
      const save = within(dialog).getByRole('button', { name: 'Lưu' });

      fireEvent.click(within(dialog).getByRole('combobox', { name: 'Giảng viên phụ trách' }));
      fireEvent.click(screen.getByRole('option', { name: 'GV B' }));
      expect(save).toBeDisabled(); // đã đổi, nhưng còn thiếu học kỳ và lớp danh nghĩa

      fireEvent.click(within(dialog).getByRole('combobox', { name: 'Học kỳ' }));
      fireEvent.click(screen.getByRole('option', { name: 'HK1 2026-2027' }));
      expect(save).toBeDisabled(); // còn thiếu lớp danh nghĩa

      fireEvent.click(within(dialog).getByRole('combobox', { name: 'Lớp danh nghĩa' }));
      fireEvent.click(screen.getByRole('option', { name: /DHKTPM18A/ }));
      expect(save).toBeEnabled();
    });
  });

  it('xoá: lý do của server hiện nguyên văn và hộp thoại KHÔNG đóng', async () => {
    const message = 'Lớp DHKTPM18A – Nhóm 1 còn 40 sinh viên nên không xoá được.';
    remove.mutateAsync.mockRejectedValue(new Error(message));
    remove.error = new Error(message);
    render(<AdminClassesPage />);

    fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Xoá' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(message)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá' }));

    await waitFor(() => expect(remove.mutateAsync).toHaveBeenCalledWith('c1'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // Review Focus 2: hộp thoại thêm/sửa dùng chung `create.error ?? update.error`, nên mỗi lần mở phải làm lại CẢ HAI mutation.
  describe('Review Focus 2: mỗi lần mở một hộp thoại là trạng thái mới', () => {
    it('mở THÊM làm lại cả create lẫn update', () => {
      render(<AdminClassesPage />);
      fireEvent.click(screen.getByRole('button', { name: /thêm lớp/i }));
      expect(create.reset).toHaveBeenCalledTimes(1);
      expect(update.reset).toHaveBeenCalledTimes(1);
    });

    it('mở SỬA làm lại cả create lẫn update', () => {
      render(<AdminClassesPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Sửa' }));
      expect(create.reset).toHaveBeenCalledTimes(1);
      expect(update.reset).toHaveBeenCalledTimes(1);
    });

    it('mở XOÁ làm lại remove', () => {
      render(<AdminClassesPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Xoá' }));
      expect(remove.reset).toHaveBeenCalledTimes(1);
    });
  });

  it('lỗi tải danh sách hiện lời báo của server', () => {
    useAdminClassesMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('Không tải được lớp') });
    render(<AdminClassesPage />);
    expect(screen.getByText('Không tải được lớp')).toBeInTheDocument();
  });
});
