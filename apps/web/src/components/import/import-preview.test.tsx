import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CLASS_KIND, ROOM_KIND, SEMESTER_KIND } from '@/lib/import/columns';
import type { ImportResult, ImportRowResult } from '@/lib/import/import-types';
import { ImportPreview } from './import-preview';

const row = (overrides: Partial<ImportRowResult> & Pick<ImportRowResult, 'line' | 'status' | 'label'>): ImportRowResult => ({
  changes: [],
  errors: [],
  similar: [],
  ...overrides,
});

function result(rows: ImportRowResult[], overrides: Partial<ImportResult> = {}): ImportResult {
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
    ...overrides,
  };
}

const noop = () => {};

describe('ImportPreview', () => {
  it('hiện số lượng thêm / sửa / giữ nguyên', () => {
    const preview = result([
      row({ line: 2, status: 'new', label: 'H3.03' }),
      row({ line: 3, status: 'new', label: 'H3.04' }),
      row({ line: 4, status: 'update', label: 'A1', changes: [{ field: 'capacity', label: 'Sức chứa', from: '40', to: '45' }] }),
      row({ line: 5, status: 'unchanged', label: 'B1' }),
    ]);
    render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);

    expect(screen.getByText('Thêm 2')).toBeInTheDocument();
    expect(screen.getByText('Sửa 1')).toBeInTheDocument();
    expect(screen.getByText('Giữ nguyên 1')).toBeInTheDocument();
    expect(screen.queryByText(/^Lỗi/)).not.toBeInTheDocument();
  });

  it('dòng lỗi hiện kèm SỐ DÒNG và lý do, và nói rõ không có dòng nào được nhập', () => {
    const preview = result([
      row({ line: 2, status: 'new', label: 'H3.03' }),
      row({ line: 7, status: 'error', label: 'Dòng 7', errors: ['Sức chứa "abc" không hợp lệ.', 'Tên phòng không được để trống.'] }),
    ]);
    render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);

    expect(screen.getByText('Lỗi 1')).toBeInTheDocument();
    expect(screen.getByText(/không có dòng nào được nhập/i)).toBeInTheDocument();
    expect(screen.getByText('Dòng 7')).toBeInTheDocument();
    expect(screen.getByText('Sức chứa "abc" không hợp lệ.')).toBeInTheDocument();
    expect(screen.getByText('Tên phòng không được để trống.')).toBeInTheDocument();
  });

  it('T-IMP-6: dòng cập nhật hiện "từ → đến", không chỉ đếm số dòng', () => {
    const preview = result([
      row({
        line: 2,
        status: 'update',
        label: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
        changes: [{ field: 'teacher', label: 'Giảng viên', from: 'Giảng viên A', to: 'Giảng viên B' }],
      }),
    ]);
    render(<ImportPreview kind={CLASS_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);

    expect(screen.getByText('DHKTPM18A – Nhóm 1 · HK1 2026-2027')).toBeInTheDocument();
    expect(screen.getByText('Giảng viên: Giảng viên A → Giảng viên B')).toBeInTheDocument();
  });

  it('Review cụm E (I1): dòng THÊM MỚI hiện giá trị đã hiểu (hai ngày), và không có mũi tên "từ → đến"', () => {
    const preview = result([
      row({
        line: 2,
        status: 'new',
        label: 'HK3 2026-2027',
        changes: [
          { field: 'startDate', label: 'Ngày bắt đầu', from: null, to: '01/06/2027' },
          { field: 'endDate', label: 'Ngày kết thúc', from: null, to: '31/08/2027' },
        ],
      }),
    ]);
    render(<ImportPreview kind={SEMESTER_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);

    expect(screen.getByText('HK3 2026-2027')).toBeInTheDocument();
    expect(screen.getByText('Ngày bắt đầu: 01/06/2027')).toBeInTheDocument();
    expect(screen.getByText('Ngày kết thúc: 31/08/2027')).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it('thay đổi từ "trống" ghi rõ là trống', () => {
    const preview = result([
      row({ line: 2, status: 'update', label: 'B1', changes: [{ field: 'capacity', label: 'Sức chứa', from: null, to: '60' }] }),
    ]);
    render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);
    expect(screen.getByText('Sức chứa: (trống) → 60')).toBeInTheDocument();
  });

  describe('gần giống (T-IMP-8)', () => {
    const similarResult = result([
      row({
        line: 2,
        status: 'new',
        label: 'H303',
        similar: [{ id: 'r3', name: 'H3.03', reason: 'normalized', source: 'existing', line: null }],
      }),
      row({
        line: 3,
        status: 'new',
        label: 'P.A101',
        similar: [{ id: null, name: 'P A101', reason: 'normalized', source: 'file', line: 4 }],
      }),
    ]);

    it('mục mới hiện cạnh mục bị so, nêu lý do và nguồn (đã có / dòng trong file)', () => {
      render(<ImportPreview kind={ROOM_KIND} result={similarResult} confirmSimilar={false} onConfirmSimilarChange={noop} />);

      expect(screen.getByText('"H303" (mới) gần giống "H3.03" (đã có)')).toBeInTheDocument();
      expect(screen.getByText('"P.A101" (mới) gần giống "P A101" (dòng 4 trong file)')).toBeInTheDocument();
      expect(screen.getAllByText(/chỉ khác dấu, hoa-thường hoặc ký tự đặc biệt/)).toHaveLength(2);
    });

    it('có ô xác nhận nêu đúng loại; tick gọi onConfirmSimilarChange(true)', () => {
      const onChange = vi.fn();
      render(<ImportPreview kind={ROOM_KIND} result={similarResult} confirmSimilar={false} onConfirmSimilarChange={onChange} />);

      const box = screen.getByRole('checkbox', { name: /đúng là những phòng khác nhau/i });
      expect(box).not.toBeChecked();
      fireEvent.click(box);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('phản ánh trạng thái đã tick', () => {
      render(<ImportPreview kind={ROOM_KIND} result={similarResult} confirmSimilar onConfirmSimilarChange={noop} />);
      expect(screen.getByRole('checkbox', { name: /đúng là những phòng khác nhau/i })).toBeChecked();
    });

    it('không có mục gần giống thì không có ô xác nhận', () => {
      const clean = result([row({ line: 2, status: 'new', label: 'H3.03' })]);
      render(<ImportPreview kind={ROOM_KIND} result={clean} confirmSimilar={false} onConfirmSimilarChange={noop} />);
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('lý do khác hiện đúng chữ', () => {
      const preview = result([
        row({
          line: 2,
          status: 'new',
          label: 'DHKTPM18ATTT',
          similar: [
            { id: 'a', name: 'DHKTPM18ATT', reason: 'insert_delete', source: 'existing', line: null },
            { id: 'b', name: 'DHKPTM18ATTT', reason: 'swap', source: 'existing', line: null },
          ],
        }),
      ]);
      render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);
      expect(screen.getByText(/hơn kém đúng một ký tự/)).toBeInTheDocument();
      expect(screen.getByText(/hai ký tự liền kề đổi chỗ/)).toBeInTheDocument();
    });
  });

  it('không có gì để ghi: báo file khớp hoàn toàn', () => {
    const preview = result([row({ line: 2, status: 'unchanged', label: 'A1' })]);
    render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);
    expect(screen.getByText(/khớp hoàn toàn/i)).toBeInTheDocument();
  });

  it('khi còn lỗi thì không nói "khớp hoàn toàn" dù không có dòng thêm/sửa', () => {
    const preview = result([row({ line: 2, status: 'error', label: 'Dòng 2', errors: ['x'] })]);
    render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);
    expect(screen.queryByText(/khớp hoàn toàn/i)).not.toBeInTheDocument();
  });
});
