import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ROOM_KIND } from '@/lib/import/columns';
import { ImportRejectedError, type ImportResult, type ImportRowResult, type RunImport } from '@/lib/import/import-types';
import type { SheetData } from '@/lib/read-workbook';
import { ImportWizard } from './import-wizard';

vi.mock('@/lib/import/template', () => ({ downloadTemplate: vi.fn() }));
import { downloadTemplate } from '@/lib/import/template';

const row = (o: Partial<ImportRowResult> & Pick<ImportRowResult, 'line' | 'status' | 'label'>): ImportRowResult => ({
  changes: [],
  errors: [],
  similar: [],
  ...o,
});

function resultOf(rows: ImportRowResult[], extra: Partial<ImportResult> = {}): ImportResult {
  return {
    dryRun: true,
    applied: false,
    counts: {
      added: rows.filter((r) => r.status === 'new').length,
      updated: rows.filter((r) => r.status === 'update').length,
      unchanged: rows.filter((r) => r.status === 'unchanged').length,
      errors: rows.filter((r) => r.status === 'error').length,
    },
    rows,
    needsSimilarConfirmation: rows.some((r) => r.status === 'new' && r.similar.length > 0),
    ...extra,
  };
}

const GOOD_SHEET: SheetData[] = [{ name: 'DS', rows: [['Tên phòng', 'Sức chứa'], ['H3.03', '40'], ['H3.04', '']] }];
const GOOD_ROWS = [
  { line: 2, name: 'H3.03', capacity: '40' },
  { line: 3, name: 'H3.04', capacity: '' },
];
const NEW_ROWS = [row({ line: 2, status: 'new', label: 'H3.03' }), row({ line: 3, status: 'new', label: 'H3.04' })];

const pick = (name = 'p.xlsx') => {
  const input = screen.getByLabelText(/file excel/i);
  fireEvent.change(input, { target: { files: [new File(['x'], name)] } });
};

function setup(run: RunImport, sheets: SheetData[] | ((file: File) => Promise<SheetData[]>) = GOOD_SHEET, onImported = vi.fn()) {
  const readSheets = typeof sheets === 'function' ? vi.fn(sheets) : vi.fn(async () => sheets);
  render(<ImportWizard kind={ROOM_KIND} run={run} readSheets={readSheets} onImported={onImported} />);
  return { readSheets, onImported };
}

describe('ImportWizard', () => {
  beforeEach(() => vi.mocked(downloadTemplate).mockReset());

  it('luồng chính: đọc file → xem trước (dryRun) → xác nhận (ghi thật) → báo đã nhập', async () => {
    const run = vi.fn<RunImport>(async ({ dryRun }) =>
      dryRun ? resultOf(NEW_ROWS) : resultOf(NEW_ROWS, { dryRun: false, applied: true }),
    );
    const { onImported } = setup(run);

    pick();

    expect(await screen.findByText('Thêm 2')).toBeInTheDocument();
    // Xem trước gửi ĐÚNG các dòng đã đọc, với số dòng như Excel hiện ra.
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ rows: GOOD_ROWS, dryRun: true });

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhập 2 dòng' }));

    expect(await screen.findByText(/Đã nhập xong: thêm 2, cập nhật 0, giữ nguyên 0/)).toBeInTheDocument();
    expect(run).toHaveBeenLastCalledWith({ rows: GOOD_ROWS, dryRun: false, confirmSimilar: false });
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ applied: true }));
  });

  it('Review cụm E (I3): đặt lại ô chọn file sau mỗi lần chọn, để chọn LẠI cùng file (sau khi sửa) vẫn phát `change`', async () => {
    // Chromium/Edge không phát `change` khi chọn lại đúng đường dẫn đang có trong ô. Vòng chính của nguyên tắc 3 — xem trước báo lỗi,
    // admin sửa file, chọn lại — hỏng nếu ô giữ giá trị cũ. `fireEvent.change` luôn phát nên test chỉ bắt được cơ chế: giá trị bị đặt về "".
    const run = vi.fn(async () => resultOf(NEW_ROWS));
    setup(run);
    const input = screen.getByLabelText(/file excel/i) as HTMLInputElement;
    const setValue = vi.fn();
    Object.defineProperty(input, 'value', { configurable: true, get: () => '', set: setValue });

    pick();
    await screen.findByText('Thêm 2');

    expect(setValue).toHaveBeenCalledWith('');
  });

  it('còn dòng lỗi: hiện lỗi, KHÔNG có nút xác nhận hoạt động và không bao giờ gọi ghi thật', async () => {
    const run = vi.fn(async () =>
      resultOf([row({ line: 2, status: 'new', label: 'H3.03' }), row({ line: 3, status: 'error', label: 'Dòng 3', errors: ['Sức chứa "x" không hợp lệ.'] })]),
    );
    setup(run);

    pick();

    expect(await screen.findByText('Sức chứa "x" không hợp lệ.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xác nhận nhập/i })).toBeDisabled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('không có gì để ghi: nút xác nhận tắt', async () => {
    setup(vi.fn(async () => resultOf([row({ line: 2, status: 'unchanged', label: 'H3.03' })])));
    pick();
    expect(await screen.findByText(/khớp hoàn toàn/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xác nhận nhập/i })).toBeDisabled();
  });

  it('Review Focus 5: còn mục gần giống thì nút tắt tới khi tick, và confirmSimilar chỉ được gửi khi đã tick', async () => {
    const withSimilar = [
      row({ line: 2, status: 'new', label: 'H303', similar: [{ id: 'r3', name: 'H3.03', reason: 'normalized', source: 'existing', line: null }] }),
    ];
    const run = vi.fn<RunImport>(async ({ dryRun }) =>
      resultOf(withSimilar, dryRun ? {} : { dryRun: false, applied: true }),
    );
    setup(run);
    pick();

    const confirm = await screen.findByRole('button', { name: /xác nhận nhập/i });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /đúng là những phòng khác nhau/i }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await screen.findByText(/Đã nhập xong/);
    expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: false, confirmSimilar: true }));
  });

  it('Review Focus 4: đáp ứng dryRun CŨ đến muộn không ghi đè bản xem trước của file mới', async () => {
    let releaseFirst: (value: ImportResult) => void = () => {};
    const slow = new Promise<ImportResult>((resolve) => {
      releaseFirst = resolve;
    });
    const run = vi
      .fn<RunImport>()
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce(resultOf([row({ line: 2, status: 'new', label: 'MỚI' })]));
    setup(run);

    pick('cu.xlsx'); // lần gọi 1: treo
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    pick('moi.xlsx'); // lần gọi 2: trả ngay
    expect(await screen.findByText('Thêm 1')).toBeInTheDocument();

    await act(async () => {
      releaseFirst(resultOf([row({ line: 2, status: 'new', label: 'a' }), row({ line: 3, status: 'new', label: 'b' }), row({ line: 4, status: 'new', label: 'c' })]));
    });

    // Vẫn là bản của file mới: nếu đáp ứng cũ ghi đè thì ở đây là "Thêm 3".
    expect(screen.getByText('Thêm 1')).toBeInTheDocument();
    expect(screen.queryByText('Thêm 3')).not.toBeInTheDocument();
  });

  it('Review Focus 6: file vượt trần dòng bị chặn ở client với câu rõ ràng, không gọi run', async () => {
    const tooMany: SheetData[] = [
      { name: 'DS', rows: [['Tên phòng', 'Sức chứa'], ...Array.from({ length: 501 }, (_, i) => [`P${i}`, ''])] },
    ];
    const run = vi.fn(async () => resultOf([]));
    setup(run, tooMany);

    pick();

    expect(await screen.findByText('File có 501 dòng dữ liệu, tối đa 500 dòng mỗi lần nhập.')).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it('file không có dòng dữ liệu: nêu vấn đề, không gọi run', async () => {
    const run = vi.fn(async () => resultOf([]));
    setup(run, [{ name: 'DS', rows: [['Tên phòng', 'Sức chứa']] }]);
    pick();
    expect(await screen.findByText('Không có dòng dữ liệu nào sau phần tiêu đề.')).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it('không nhận diện được tên cột: nói rõ và mở sẵn bước chỉnh cột; nhận diện được thì chỉ có nút "Chỉnh cột"', async () => {
    const run = vi.fn(async () => resultOf(NEW_ROWS));
    setup(run, [{ name: 'DS', rows: [['Cái này', 'Cái kia'], ['H3.03', '40']] }]);
    pick();

    expect(await screen.findByText(/chưa nhận diện được tên cột/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tên phòng' })).toBeInTheDocument();
  });

  it('nhận diện được: hiện lời xác nhận cột đã nhận, chưa mở bước chỉnh cột', async () => {
    setup(vi.fn(async () => resultOf(NEW_ROWS)));
    pick();
    expect(await screen.findByText(/đã nhận diện cột theo tên/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Tên phòng' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh cột' }));
    expect(screen.getByRole('combobox', { name: 'Tên phòng' })).toBeInTheDocument();
  });

  it('chỉnh cột bằng tay tính lại và xem trước lại với dòng mới', async () => {
    const run = vi.fn(async () => resultOf(NEW_ROWS));
    setup(run, [{ name: 'DS', rows: [['Cái này', 'Cái kia'], ['40', 'H3.03']] }]);
    pick();
    await screen.findByText(/chưa nhận diện được tên cột/i);
    // Ghép theo thứ tự: tên phòng = cột A ("40"), sức chứa = cột B ("H3.03"). Chọn cột B cho tên phòng: cột B đang thuộc
    // sức chứa nên HAI TRƯỜNG HOÁN ĐỔI (một cột không bao giờ gán cho hai trường) — sức chứa nhận cột A.
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenLastCalledWith({ rows: [{ line: 2, name: '40', capacity: 'H3.03' }], dryRun: true });

    fireEvent.click(screen.getByRole('combobox', { name: 'Tên phòng' }));
    fireEvent.click(screen.getByRole('option', { name: /Cột B/ }));

    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(run).toHaveBeenLastCalledWith({ rows: [{ line: 2, name: 'H3.03', capacity: '40' }], dryRun: true });
  });

  it('Review Focus 8: lỗi mạng khi xem trước hiện thành lời báo lỗi, không phải bản xem trước rỗng', async () => {
    setup(vi.fn(async () => { throw new Error('Mất kết nối'); }));
    pick();
    expect(await screen.findByText('Mất kết nối')).toBeInTheDocument();
    expect(screen.queryByText(/^Thêm/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xác nhận nhập/i })).toBeDisabled();
  });

  it('server từ chối lần ghi thật kèm bản xem trước mới: hiện lại bản mới và lời của server, bỏ tick cũ', async () => {
    const stale = resultOf(NEW_ROWS);
    const fresh = resultOf([row({ line: 2, status: 'error', label: 'Dòng 2', errors: ['Phòng "H3.03" đã tồn tại.'] })]);
    const run = vi.fn<RunImport>(async ({ dryRun }) => {
      if (dryRun) return stale;
      throw new ImportRejectedError('File có 1 dòng lỗi nên không có gì được ghi.', 'IMPORT_HAS_ERRORS', fresh);
    });
    setup(run);
    pick();

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận nhập 2 dòng' }));

    expect(await screen.findByText('File có 1 dòng lỗi nên không có gì được ghi.')).toBeInTheDocument();
    expect(screen.getByText('Phòng "H3.03" đã tồn tại.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xác nhận nhập/i })).toBeDisabled();
  });

  it('không đọc được file: hiện lời báo, không gọi run', async () => {
    const run = vi.fn(async () => resultOf([]));
    setup(run, async () => {
      throw new Error('Không đọc được file.');
    });
    pick();
    expect(await screen.findByText('Không đọc được file.')).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it('nhiều sheet: chọn sheet nhận diện được thay vì sheet bìa', async () => {
    const sheets: SheetData[] = [{ name: 'Bia', rows: [['Giới thiệu']] }, ...GOOD_SHEET];
    const run = vi.fn(async () => resultOf(NEW_ROWS));
    setup(run, sheets);
    pick();
    await screen.findByText('Thêm 2');
    expect(run).toHaveBeenCalledWith({ rows: GOOD_ROWS, dryRun: true });
  });

  it('nút "Tải file mẫu" tải mẫu của đúng loại', () => {
    setup(vi.fn(async () => resultOf([])));
    fireEvent.click(screen.getByRole('button', { name: /tải file mẫu/i }));
    expect(downloadTemplate).toHaveBeenCalledWith(ROOM_KIND);
  });

  it('liệt kê các cột cần có, đánh dấu cột không bắt buộc', () => {
    setup(vi.fn(async () => resultOf([])));
    expect(screen.getByText(/Tên phòng/)).toBeInTheDocument();
    expect(screen.getByText(/Sức chứa \(không bắt buộc\)/)).toBeInTheDocument();
  });
});
