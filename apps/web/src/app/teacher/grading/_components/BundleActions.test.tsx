import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ApiStatusError } from '@/lib/api/error';
import type { GenerateResult, TestBundleSummary } from '@/lib/api/test-bundle';
import { BundleActions } from './BundleActions';

const h = vi.hoisted(() => ({
  generate: {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null as Error | null,
    data: undefined as unknown,
    variables: undefined as unknown,
  },
}));
vi.mock('./AnswerSourceForm', () => ({ AnswerSourceForm: () => <div data-testid="answer-source-form" /> }));

const bundle = (over: Partial<TestBundleSummary> = {}): TestBundleSummary => ({
  id: 'b1', version: 1, approvedAt: null, origin: 'teacher', caseCount: 3, ...over,
});

const runs = (over: Record<string, unknown> = {}) => ({
  runs: {},
  run: vi.fn(),
  clearError: vi.fn(),
  pendingKey: null as string | null,
  error: null as Error | null,
  ...over,
});

function setup(over: { bundles?: TestBundleSummary[]; pinnedBundleId?: string | null; runs?: ReturnType<typeof runs> } = {}) {
  const r = over.runs ?? runs();
  render(
    <BundleActions
      sessionId="s1"
      bundles={over.bundles ?? [bundle()]}
      pinnedBundleId={over.pinnedBundleId ?? null}
      runs={r}
      generate={h.generate as unknown as React.ComponentProps<typeof BundleActions>['generate']}
    />,
  );
  return r;
}

const generated = (over: Partial<GenerateResult> = {}): GenerateResult => ({
  testBundle: { id: 'b3', version: 3, caseCount: 5, droppedCount: 1 },
  ruler: { trust: 'verified', examplesChecked: 2 },
  run: { runId: 'r1', status: 'pass' },
  warnings: [],
  ...over,
});

beforeEach(() => {
  h.generate = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null, data: undefined, variables: undefined };
});

// Mỗi việc bắt đầu xoá lỗi của việc kia: chạy thử không để lại lỗi "sinh" cũ, sinh không để lại lỗi "chạy" cũ.
describe('một lỗi tại một thời điểm (W1)', () => {
  it('bấm chạy thử → lỗi của lượt sinh trước được gỡ (reset)', () => {
    h.generate = { ...h.generate, isError: true, error: new ApiStatusError('Phiên đã có đáp án mẫu của giảng viên.', 409, {}) } as typeof h.generate;
    const r = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Chạy thử đáp án mẫu với gói test' }));
    expect(h.generate.reset).toHaveBeenCalledTimes(1);
    expect(r.run).toHaveBeenCalledWith('b1');
  });

  it('bấm sinh → lỗi của lượt chạy thử trước được gỡ (clearError), không đứng cạnh kết quả sinh', () => {
    const r = setup({ runs: runs({ error: new ApiStatusError('chưa có mã đáp án để chạy — hãy tải mã lên', 409, {}) }) });
    fireEvent.click(screen.getByRole('button', { name: 'Sinh gói test từ đáp án của bạn' }));
    expect(r.clearError).toHaveBeenCalledTimes(1);
    expect(h.generate.mutate).toHaveBeenCalledWith('answer');
  });
});

describe('BundleActions — ba nút sinh và chạy thử (G2b-R)', () => {
  it('có đủ ba nút, không còn nhãn "cần backend"', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Sinh đáp án mẫu và gói test từ đề' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sinh gói test từ đáp án của bạn' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Chạy thử đáp án mẫu với gói test' })).toBeEnabled();
    expect(screen.queryByText('cần backend')).not.toBeInTheDocument();
  });

  it('hai nút sinh gọi đúng chế độ', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sinh đáp án mẫu và gói test từ đề' }));
    expect(h.generate.mutate).toHaveBeenLastCalledWith('statement');
    fireEvent.click(screen.getByRole('button', { name: 'Sinh gói test từ đáp án của bạn' }));
    expect(h.generate.mutate).toHaveBeenLastCalledWith('answer');
  });

  it('chạy thử nhắm vào gói đang ghim dù có phiên bản mới hơn', () => {
    const r = setup({ bundles: [bundle({ id: 'b1', version: 1 }), bundle({ id: 'b2', version: 2 })], pinnedBundleId: 'b1' });
    fireEvent.click(screen.getByRole('button', { name: 'Chạy thử đáp án mẫu với gói test' }));
    expect(r.run).toHaveBeenCalledWith('b1');
  });

  it('chưa ghim → chạy phiên bản mới nhất, và nói rõ đang chạy phiên bản nào', () => {
    const r = setup({ bundles: [bundle({ id: 'b1', version: 1 }), bundle({ id: 'b2', version: 2 })] });
    fireEvent.click(screen.getByRole('button', { name: 'Chạy thử đáp án mẫu với gói test' }));
    expect(r.run).toHaveBeenCalledWith('b2');
    expect(screen.getByText(/phiên bản 2/)).toBeInTheDocument();
  });

  it('chưa có gói nào → nút chạy thử khoá kèm lý do, hai nút sinh vẫn bấm được', () => {
    setup({ bundles: [] });
    expect(screen.getByRole('button', { name: 'Chạy thử đáp án mẫu với gói test' })).toBeDisabled();
    expect(screen.getByText(/Chưa có gói test để chạy thử/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sinh đáp án mẫu và gói test từ đề' })).toBeEnabled();
  });

  it('đang sinh: cả ba nút khoá và nói trước là có thể mất vài phút', () => {
    h.generate.isPending = true;
    setup();
    expect(screen.getByRole('button', { name: 'Sinh đáp án mẫu và gói test từ đề' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sinh gói test từ đáp án của bạn' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chạy thử đáp án mẫu với gói test' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/vài phút/);
  });

  it('đang chạy thử: các nút khoá, không gửi lượt thứ hai', () => {
    setup({ runs: runs({ pendingKey: 'b1' }) });
    expect(screen.getByRole('button', { name: /Chạy thử đáp án mẫu/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sinh đáp án mẫu và gói test từ đề' })).toBeDisabled();
  });

  describe('kết quả sinh', () => {
    beforeEach(() => {
      h.generate.isSuccess = true;
    });

    it('từ đề, ví dụ khớp: nêu phiên bản, số ca, số ca bị bỏ, "chưa duyệt", và độ tin cậy kèm lời nhắc khớp chưa chắc đúng', () => {
      h.generate.data = generated();
      h.generate.variables = 'statement';
      setup();
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('phiên bản 3');
      expect(status).toHaveTextContent('5 ca');
      expect(status).toHaveTextContent('1 ca bị bỏ');
      expect(status).toHaveTextContent('chưa duyệt');
      expect(status).toHaveTextContent('2 ví dụ trong đề');
      expect(status).toHaveTextContent('chưa chứng tỏ đúng');
    });

    it('từ đề, đề không có ví dụ: nói thẳng là chưa được kiểm chứng', () => {
      h.generate.data = generated({ ruler: { trust: 'unverified', examplesChecked: 0 } });
      h.generate.variables = 'statement';
      setup();
      expect(screen.getByRole('status')).toHaveTextContent(/CHƯA được kiểm chứng/);
      // Đề có thể CÓ ví dụ nhưng quá ngắn để đối chiếu: câu chữ không được nói như thể đề không có ví dụ nào.
      expect(screen.getByRole('status')).toHaveTextContent(/ví dụ đủ dài/);
    });

    it('từ đáp án của giảng viên: không có dòng độ tin cậy của thước (đáp án là của bạn)', () => {
      h.generate.data = generated({ ruler: undefined });
      h.generate.variables = 'answer';
      setup();
      expect(screen.getByRole('status')).not.toHaveTextContent(/ví dụ trong đề/);
    });

    it('cảnh báo độ phủ hiện từng dòng', () => {
      h.generate.data = generated({ warnings: ['Chỉ còn 2/3 ca sau khi lọc.', 'Thiếu ca nhóm bien (biên).'] });
      h.generate.variables = 'statement';
      setup();
      expect(screen.getByText('Chỉ còn 2/3 ca sau khi lọc.')).toBeInTheDocument();
      expect(screen.getByText('Thiếu ca nhóm bien (biên).')).toBeInTheDocument();
    });
  });

  describe('lỗi', () => {
    it('lỗi thường hiện nguyên văn, không mở form tải mã', () => {
      h.generate.isError = true;
      h.generate.error = new ApiStatusError('Phiên đã có đáp án mẫu của giảng viên — không ghi đè.', 409, {});
      setup();
      expect(screen.getByRole('alert')).toHaveTextContent('Phiên đã có đáp án mẫu của giảng viên');
      expect(screen.queryByTestId('answer-source-form')).not.toBeInTheDocument();
    });

    it('409 "chưa có mã đáp án" khi sinh từ đáp án → hiện form tải mã', () => {
      h.generate.isError = true;
      h.generate.error = new ApiStatusError('Chưa có mã đáp án để sinh gói test — hãy tải mã đáp án lên trước.', 409, {});
      setup();
      expect(screen.getByTestId('answer-source-form')).toBeInTheDocument();
    });

    it('409 "chưa có mã đáp án" khi chạy thử → cũng hiện form tải mã', () => {
      setup({ runs: runs({ error: new ApiStatusError('chưa có mã đáp án để chạy — hãy tải mã lên', 409, {}) }) });
      expect(screen.getByRole('alert')).toHaveTextContent('chưa có mã đáp án để chạy');
      expect(screen.getByTestId('answer-source-form')).toBeInTheDocument();
    });

    it('422 lệch ví dụ trong đề: liệt kê từng ví dụ mong đợi và nhận được', () => {
      h.generate.isError = true;
      h.generate.error = new ApiStatusError('Đáp án chạy thật không tái tạo đúng ví dụ trong đề.', 422, {
        mismatches: [{ input: '2\n5 6', expected: '6 5', actual: '5 6' }],
      });
      setup();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Mong đợi');
      expect(alert).toHaveTextContent('6 5');
      expect(alert).toHaveTextContent('Nhận được');
      expect(alert).toHaveTextContent('5 6');
    });

    it('422 không biên dịch: hiện log biên dịch', () => {
      h.generate.isError = true;
      h.generate.error = new ApiStatusError('Đáp án không biên dịch được — không ghi gói test.', 422, {
        compileLog: 'main.cpp:1:1: error: expected unqualified-id',
      });
      setup();
      expect(screen.getByRole('alert')).toHaveTextContent('error: expected unqualified-id');
    });
  });

  it('nút "Tải mã đáp án" luôn có, bật tắt form tải mã', () => {
    setup();
    expect(screen.queryByTestId('answer-source-form')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tải mã đáp án (.cpp, .py)' }));
    expect(screen.getByTestId('answer-source-form')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tải mã đáp án (.cpp, .py)' }));
    expect(screen.queryByTestId('answer-source-form')).not.toBeInTheDocument();
  });
});
