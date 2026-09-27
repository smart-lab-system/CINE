import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TestBundleCard } from './TestBundleCard';

const createMock = vi.fn();
const approveMock = vi.fn();
const pinMock = vi.fn();

vi.mock('@/hooks/useTestBundle', () => ({
  useTestBundles: () => useTestBundlesMock(),
  useCreateTestBundle: () => ({ mutate: createMock, isPending: false }),
  useApproveTestBundle: () => ({ mutate: approveMock, isPending: false }),
  usePinTestBundle: () => ({ mutate: pinMock, isPending: false }),
}));

let useTestBundlesMock = () => ({ data: [] as unknown[], isLoading: false });

describe('TestBundleCard', () => {
  it('chưa có gói nào → hiện lời nhắc tạo gói và nút thêm ca', () => {
    useTestBundlesMock = () => ({ data: [], isLoading: false });
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    expect(screen.getByText(/chưa có gói test/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thêm ca/i })).toBeInTheDocument();
  });

  it('gói CHƯA duyệt → hiện nút Duyệt, KHÔNG hiện nút Ghim', () => {
    useTestBundlesMock = () => ({
      data: [{ id: 'b1', version: 1, approvedAt: null, caseCount: 2 }],
      isLoading: false,
    });
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    expect(screen.getByRole('button', { name: /duyệt/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ghim$/i })).not.toBeInTheDocument();
  });

  it('gói ĐÃ duyệt, chưa ghim → hiện nút Ghim, KHÔNG hiện nút Duyệt', () => {
    useTestBundlesMock = () => ({
      data: [{ id: 'b1', version: 1, approvedAt: '2026-09-27T00:00:00.000Z', caseCount: 2 }],
      isLoading: false,
    });
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    expect(screen.getByRole('button', { name: /^ghim$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /duyệt/i })).not.toBeInTheDocument();
  });

  it('gói ĐANG ghim → hiện huy hiệu "Đang dùng", không hiện nút Ghim', () => {
    useTestBundlesMock = () => ({
      data: [{ id: 'b1', version: 1, approvedAt: '2026-09-27T00:00:00.000Z', caseCount: 2 }],
      isLoading: false,
    });
    render(<TestBundleCard sessionId="s1" pinnedBundleId="b1" />);
    expect(screen.getByText(/đang dùng/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ghim$/i })).not.toBeInTheDocument();
  });

  it('bấm "Ghim" gọi usePinTestBundle với đúng bundleId', () => {
    useTestBundlesMock = () => ({
      data: [{ id: 'b1', version: 1, approvedAt: '2026-09-27T00:00:00.000Z', caseCount: 2 }],
      isLoading: false,
    });
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    fireEvent.click(screen.getByRole('button', { name: /^ghim$/i }));
    expect(pinMock).toHaveBeenCalledWith('b1');
  });

  it('thêm một dòng ca rồi bấm "Tạo gói" gọi useCreateTestBundle với đúng ca', () => {
    useTestBundlesMock = () => ({ data: [], isLoading: false });
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);

    fireEvent.change(screen.getByLabelText(/tên ca/i), { target: { value: 'ca1' } });
    fireEvent.change(screen.getByLabelText(/nhóm/i), { target: { value: 'co_ban' } });
    fireEvent.change(screen.getByLabelText(/^input/i), { target: { value: '1 2' } });
    fireEvent.change(screen.getByLabelText(/output mong đợi/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /tạo gói/i }));

    expect(createMock).toHaveBeenCalledWith(
      [{ caseKey: 'ca1', group: 'co_ban', input: '1 2', expectedOutput: '3' }],
      expect.any(Object),
    );
  });
});
