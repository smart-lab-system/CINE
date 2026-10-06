import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ImportResult } from '@/lib/import/import-types';

// `vi.mock` được kéo lên đầu file nên factory không thấy được biến `const` thường — `vi.hoisted` khởi tạo chúng trước.
const { room, klass } = vi.hoisted(() => ({ room: vi.fn(), klass: vi.fn() }));
vi.mock('@/lib/api/master-data-import', () => ({
  IMPORT_RUNNERS: { semester: vi.fn(), room, 'administrative-class': vi.fn(), class: klass },
}));

import { MASTER_DATA_KEYS } from './master-data-keys';
import { useImportRunner } from './useMasterDataImport';

const RESULT = (overrides: Partial<ImportResult> = {}): ImportResult => ({
  dryRun: false,
  applied: true,
  counts: { added: 1, updated: 0, unchanged: 0, errors: 0 },
  rows: [],
  needsSimilarConfirmation: false,
  ...overrides,
});

function setup(kind: Parameters<typeof useImportRunner>[0]) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, rerender } = renderHook(() => useImportRunner(kind), { wrapper });
  return { result, rerender, invalidate };
}

describe('useImportRunner', () => {
  beforeEach(() => {
    room.mockReset();
    klass.mockReset();
  });

  it('chuyển yêu cầu và trả kết quả của đúng bộ chạy theo loại', async () => {
    room.mockResolvedValue(RESULT());
    const { result } = setup('room');
    const request = { rows: [{ line: 2, name: 'H3.03', capacity: '' }], dryRun: true };

    await expect(result.current(request)).resolves.toEqual(RESULT());

    expect(room).toHaveBeenCalledWith(request);
    expect(klass).not.toHaveBeenCalled();
  });

  it('dryRun KHÔNG làm mới truy vấn nào: chưa có gì đổi', async () => {
    room.mockResolvedValue(RESULT({ dryRun: true, applied: false }));
    const { result, invalidate } = setup('room');

    await result.current({ rows: [], dryRun: true });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('ghi thật đã áp dụng: làm mới danh sách của loại đó', async () => {
    room.mockResolvedValue(RESULT());
    const { result, invalidate } = setup('room');

    await result.current({ rows: [], dryRun: false });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: [MASTER_DATA_KEYS.rooms] });
  });

  it('import lớp làm mới khoá GỐC `classes` — phủ cả trang quản trị lẫn "Lớp của tôi"', async () => {
    klass.mockResolvedValue(RESULT());
    const { result, invalidate } = setup('class');

    await result.current({ rows: [], dryRun: false });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['classes'] });
  });

  it('ghi thật nhưng không có gì để ghi (applied=false): không làm mới', async () => {
    room.mockResolvedValue(RESULT({ applied: false }));
    const { result, invalidate } = setup('room');

    await result.current({ rows: [], dryRun: false });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('lỗi của server được ném lại nguyên vẹn và không làm mới gì', async () => {
    room.mockRejectedValue(new Error('Máy chủ từ chối'));
    const { result, invalidate } = setup('room');

    await expect(result.current({ rows: [], dryRun: false })).rejects.toThrow('Máy chủ từ chối');

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('tham chiếu ổn định qua các lần render — nếu không, ImportWizard gọi dryRun lại ở mỗi lần cha render', () => {
    const { result, rerender } = setup('room');
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
