import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TestBundleCard } from './TestBundleCard';

const h = vi.hoisted(() => ({
  bundles: { data: [] as unknown[], isLoading: false },
  create: { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  generate: { mutate: vi.fn(), reset: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null as Error | null },
  fetchDetail: vi.fn(),
  runs: { runs: {}, run: vi.fn(), clearError: vi.fn(), pendingKey: null as string | null, error: null as Error | null },
}));

vi.mock('@/hooks/useTestBundle', () => ({
  useTestBundles: () => h.bundles,
  useCreateTestBundle: () => h.create,
  useGenerateTestBundle: () => h.generate,
}));
vi.mock('@/hooks/useTestBundleDetail', () => ({ useFetchTestBundle: () => h.fetchDetail }));
vi.mock('@/hooks/useBundleRuns', () => ({ useBundleRuns: () => h.runs }));
// Hai khối này có test riêng; ở đây chỉ cần biết thẻ nối chúng đúng.
vi.mock('./BundleActions', () => ({
  BundleActions: ({ pinnedBundleId }: { pinnedBundleId: string | null }) => <div data-testid="bundle-actions" data-pinned={String(pinnedBundleId)} />,
}));
vi.mock('./TestBundleList', () => ({
  TestBundleList: ({ onNewVersion }: { onNewVersion: (id: string) => void }) => (
    <button type="button" onClick={() => onNewVersion('b1')}>
      mô phỏng: tạo phiên bản mới từ b1
    </button>
  ),
}));

const base = () => ({
  id: 'b1',
  version: 2,
  approvedAt: null,
  cases: [
    { caseKey: 'ca1', group: 'co_ban', input: '5\n1 2 3 4 5', expectedOutput: '15', constraintQuote: 'Dòng đầu là n', autoDroppedReason: null },
    { caseKey: 'ca2', group: 'bien', input: '1\n-3', expectedOutput: '-3', constraintQuote: null, autoDroppedReason: null },
    { caseKey: 'ca3', group: 'bien', input: '0', expectedOutput: '', constraintQuote: null, autoDroppedReason: 'không trích được câu nào trong đề' },
  ],
});

beforeEach(() => {
  h.bundles = { data: [{ id: 'b1', version: 2, approvedAt: null, origin: 'generated', caseCount: 2 }], isLoading: false };
  h.create = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };
  h.fetchDetail = vi.fn().mockResolvedValue(base());
  h.runs = { runs: {}, run: vi.fn(), clearError: vi.fn(), pendingKey: null, error: null };
});

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function startFromB1() {
  fireEvent.click(screen.getByRole('button', { name: 'mô phỏng: tạo phiên bản mới từ b1' }));
  await screen.findByRole('region', { name: /Bản nháp/ });
}

describe('TestBundleCard — nối khối, và bản nháp phiên bản mới (G2b-R)', () => {
  it('nối ba nút và danh sách: ba nút nhận gói đang ghim', () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId="b1" />);
    expect(screen.getByTestId('bundle-actions')).toHaveAttribute('data-pinned', 'b1');
  });

  it('chưa có bản nháp: có nút tạo, KHÔNG có bảng nháp; chưa có gói nào thì nút nói "Tạo gói bằng tay"', () => {
    h.bundles = { data: [], isLoading: false };
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    expect(screen.queryByRole('region', { name: /Bản nháp/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo gói bằng tay' })).toBeInTheDocument();
  });

  it('tạo tay từ đầu: mở bản nháp rỗng với form thêm ca, tên ca đề xuất ca1, tên phiên bản kế tiếp', () => {
    h.bundles = { data: [], isLoading: false };
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói bằng tay' }));

    expect(screen.getByRole('region', { name: /Bản nháp/ })).toHaveTextContent('phiên bản 1');
    expect(screen.getByLabelText(/^Tên ca/)).toHaveValue('ca1');
  });

  it('thêm ca rồi lưu: gửi đúng các ca lên route tạo gói và dọn bản nháp khi thành công', () => {
    h.bundles = { data: [], isLoading: false };
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói bằng tay' }));

    type(/^Input/, '1 2');
    type(/^Output mong đợi/, '3');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào bản nháp' }));

    expect(screen.getByRole('button', { name: /Lưu thành phiên bản 1/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Lưu thành phiên bản 1/ }));

    expect(h.create.mutate).toHaveBeenCalledTimes(1);
    expect(h.create.mutate.mock.calls[0][0].cases).toEqual([{ caseKey: 'ca1', group: 'co_ban', input: '1 2', expectedOutput: '3' }]);

    act(() => h.create.mutate.mock.calls[0][1].onSuccess({ id: 'b9', version: 1 }));
    expect(screen.queryByRole('region', { name: /Bản nháp/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu phiên bản 1. Chưa duyệt, chưa dùng để chấm.');
  });

  it('form thêm hỏng thì KHÔNG thêm dòng nào và không gọi lưu', () => {
    h.bundles = { data: [], isLoading: false };
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói bằng tay' }));

    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào bản nháp' })); // output trống

    expect(screen.getByLabelText(/^Output mong đợi/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /Lưu thành phiên bản/ })).toBeDisabled();
    expect(h.create.mutate).not.toHaveBeenCalled();
  });

  it('bắt đầu từ một phiên bản: chép các ca của nó; ca hệ thống đã bỏ hiện gạch ngang và không có nút', async () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();

    expect(h.fetchDetail).toHaveBeenCalledWith('b1');
    const draft = within(screen.getByRole('region', { name: /Bản nháp/ }));
    expect(draft.getByText('ca1')).toBeInTheDocument();
    expect(draft.getByText('ca2')).toBeInTheDocument();
    const dropped = draft.getByText('ca3').closest('tr')!;
    expect(dropped.className).toContain('line-through');
    expect(within(dropped).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Bản nháp/ })).toHaveTextContent('phiên bản 3');
  });

  // Bản dẫn xuất gửi kèm gói gốc để server kế thừa origin (gói do hệ thống sinh không thành nhãn "teacher").
  it('bản tạo từ một phiên bản gửi kèm derivedFromBundleId = gói gốc; bản tạo tay thì không gửi', async () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ ca ca2' }));
    fireEvent.click(screen.getByRole('button', { name: /Lưu thành phiên bản 3/ }));
    expect(h.create.mutate.mock.calls[0][0]).toMatchObject({ derivedFromBundleId: 'b1' });
  });

  // Phiên bản mà server cấp có thể khác số đoán lúc mở bản nháp (có phiên bản khác được lưu trong lúc sửa): thông báo phải nói số thật.
  it('thông báo lưu nêu số phiên bản mà SERVER đã cấp, không phải số đoán lúc mở bản nháp', async () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ ca ca2' }));
    fireEvent.click(screen.getByRole('button', { name: /Lưu thành phiên bản 3/ }));

    act(() => h.create.mutate.mock.calls[0][1].onSuccess({ id: 'x', version: 4 }));

    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu phiên bản 4. Chưa duyệt, chưa dùng để chấm.');
  });

  // Lỗi của lần lưu trước không được đứng lại sau khi giảng viên đã huỷ bản nháp đó.
  it('huỷ bản nháp gỡ lỗi của lần lưu trước (reset), không để lỗi cũ đứng lại', async () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ bản nháp' }));
    expect(h.create.reset).toHaveBeenCalled();
  });

  it('chưa đổi gì thì không lưu được và nói rõ lý do', async () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();

    expect(screen.getByRole('button', { name: /Lưu thành phiên bản 3/ })).toBeDisabled();
    expect(screen.getByText('Chưa có thay đổi nào để lưu.')).toBeInTheDocument();
  });

  it('sửa một ca: form điền sẵn, ca đổi thành "Đã sửa" và mất trích đề; lưu gửi giá trị mới', async () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();

    fireEvent.click(screen.getByRole('button', { name: 'Sửa ca ca1' }));
    expect(screen.getByRole('heading', { name: 'Sửa ca ca1' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Output mong đợi/)).toHaveValue('15');
    type(/^Output mong đợi/, '16');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ca' }));

    const row = screen.getByText('ca1').closest('tr')!;
    expect(within(row).getByText('Đã sửa')).toBeInTheDocument();
    expect(within(row).queryByText(/Dòng đầu là n/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Lưu thành phiên bản 3/ }));
    expect(h.create.mutate.mock.calls[0][0].cases).toEqual([
      { caseKey: 'ca1', group: 'co_ban', input: '5\n1 2 3 4 5', expectedOutput: '16' },
      { caseKey: 'ca2', group: 'bien', input: '1\n-3', expectedOutput: '-3' },
    ]);
  });

  it('bỏ một ca: ca gạch ngang với nút Hoàn tác, lưu không gửi ca đó; hoàn tác thì ca trở lại', async () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ ca ca2' }));
    expect(screen.getByRole('button', { name: 'Hoàn tác ca ca2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lưu thành phiên bản 3/ }));
    expect(h.create.mutate.mock.calls[0][0].cases.map((c: { caseKey: string }) => c.caseKey)).toEqual(['ca1']);

    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác ca ca2' }));
    expect(screen.getByText('Chưa có thay đổi nào để lưu.')).toBeInTheDocument();
  });

  it('thêm ca vào bản nháp có sẵn: tên đề xuất tiếp theo ca4 (không tái dùng số của ca đã bỏ), ca giữ nguyên vẫn mang trích đề khi lưu', async () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm ca' }));
    expect(screen.getByLabelText(/^Tên ca/)).toHaveValue('ca4');
    type(/^Output mong đợi/, '9');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào bản nháp' }));
    fireEvent.click(screen.getByRole('button', { name: /Lưu thành phiên bản 3/ }));

    const sent = h.create.mutate.mock.calls[0][0].cases;
    expect(sent.find((c: { caseKey: string }) => c.caseKey === 'ca1')).toMatchObject({ constraintQuote: 'Dòng đầu là n' });
    expect(sent.find((c: { caseKey: string }) => c.caseKey === 'ca4')).not.toHaveProperty('constraintQuote');
  });

  it('đang mở form thì không lưu được: "Lưu hoặc huỷ ca đang nhập trước."', async () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm ca' }));

    expect(screen.getByText('Lưu hoặc huỷ ca đang nhập trước.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lưu thành phiên bản 3/ })).toBeDisabled();
  });

  it('"Huỷ bản nháp" bỏ bản nháp mà không gọi server', async () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ bản nháp' }));

    expect(screen.queryByRole('region', { name: /Bản nháp/ })).not.toBeInTheDocument();
    expect(h.create.mutate).not.toHaveBeenCalled();
  });

  it('đang có bản nháp thì không mở bản nháp thứ hai từ danh sách, và nói lý do', async () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();
    h.fetchDetail.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'mô phỏng: tạo phiên bản mới từ b1' }));

    expect(h.fetchDetail).not.toHaveBeenCalled();
    expect(screen.getByText(/Lưu hoặc huỷ bản nháp hiện tại trước/)).toBeInTheDocument();
  });

  it('lưu hỏng: hiện lỗi của máy chủ nguyên văn và GIỮ bản nháp để không mất công gõ', async () => {
    h.create = { ...h.create, isError: true, error: new Error('phiên này có 2 câu — sửa tài liệu chấm theo từng câu') };
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    await startFromB1();

    expect(screen.getByText('phiên này có 2 câu — sửa tài liệu chấm theo từng câu')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Bản nháp/ })).toBeInTheDocument();
  });

  it('không lấy được chi tiết phiên bản gốc: báo lỗi và không mở bản nháp rỗng', async () => {
    h.fetchDetail = vi.fn().mockRejectedValue(new Error('Không tải được gói'));
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'mô phỏng: tạo phiên bản mới từ b1' }));

    expect(await screen.findByText('Không tải được gói')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Bản nháp/ })).not.toBeInTheDocument();
  });
});
