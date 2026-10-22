import { describe, expect, it } from 'vitest';
import type { TestBundleCase } from '@/lib/api/test-bundle';
import {
  addRow,
  changesCount,
  editRow,
  nextCaseKey,
  removeRow,
  saveBlocker,
  startDraft,
  toCreateInput,
  undoRow,
  validateCase,
  type DraftRow,
} from './test-case-draft';

const bundleCase = (over: Partial<TestBundleCase> = {}): TestBundleCase => ({
  caseKey: 'ca1',
  group: 'co_ban',
  input: '3\n1 2 3\n',
  expectedOutput: '6\n',
  constraintQuote: 'Dòng đầu là n (1 ≤ n ≤ 100)',
  autoDroppedReason: null,
  ...over,
});

const values = (over: Partial<Record<'caseKey' | 'group' | 'input' | 'expectedOutput', string>> = {}) => ({
  caseKey: 'ca9',
  group: 'bien',
  input: '1\n7\n',
  expectedOutput: '7\n',
  ...over,
});

describe('bản nháp phiên bản gói test (G2b-R, mock-up v2)', () => {
  describe('startDraft', () => {
    it('chép mọi ca của phiên bản gốc: ca thường là same, ca hệ thống đã bỏ là dropped (chỉ để hiện)', () => {
      const rows = startDraft([bundleCase(), bundleCase({ caseKey: 'ca2', autoDroppedReason: 'không trích được đề' })]);
      expect(rows.map((r) => [r.caseKey, r.state])).toEqual([['ca1', 'same'], ['ca2', 'dropped']]);
      expect(rows[0].base).toEqual({ caseKey: 'ca1', group: 'co_ban', input: '3\n1 2 3\n', expectedOutput: '6\n' });
      expect(rows[1].autoDroppedReason).toBe('không trích được đề');
    });

    it('không có phiên bản gốc → bản nháp rỗng', () => {
      expect(startDraft(null)).toEqual([]);
    });
  });

  describe('validateCase', () => {
    const rows = startDraft([bundleCase()]);

    it('ca hợp lệ không có lỗi', () => {
      expect(validateCase(values(), rows, null)).toEqual({});
    });

    it('tên ca trống, sai khuôn, hay quá 64 ký tự → lỗi cạnh ô tên ca, câu nói rõ cần gì', () => {
      expect(validateCase(values({ caseKey: '  ' }), rows, null).caseKey).toMatch(/Nhập tên ca/);
      expect(validateCase(values({ caseKey: 'ca 9' }), rows, null).caseKey).toMatch(/chữ, số, dấu _ và -/);
      expect(validateCase(values({ caseKey: 'a'.repeat(65) }), rows, null).caseKey).toMatch(/64 ký tự/);
    });

    it('tên ca trùng một ca đang dùng → lỗi; trùng chính dòng đang sửa thì không', () => {
      expect(validateCase(values({ caseKey: 'ca1' }), rows, null).caseKey).toMatch(/đã có trong gói/);
      expect(validateCase(values({ caseKey: 'ca1' }), rows, 0)).toEqual({});
    });

    it('tên ca trùng ca đã bỏ trong bản nháp hay ca hệ thống đã bỏ thì được dùng lại', () => {
      const withGone = removeRow(startDraft([bundleCase(), bundleCase({ caseKey: 'ca2', autoDroppedReason: 'x' })]), 0);
      expect(validateCase(values({ caseKey: 'ca1' }), withGone, null)).toEqual({});
      expect(validateCase(values({ caseKey: 'ca2' }), withGone, null)).toEqual({});
    });

    it('nhóm trống hay dài quá 100 ký tự → lỗi', () => {
      expect(validateCase(values({ group: ' ' }), rows, null).group).toMatch(/nhóm/i);
      expect(validateCase(values({ group: 'g'.repeat(101) }), rows, null).group).toMatch(/100/);
    });

    it('input 0 và output rỗng là một ca hợp lệ', () => {
      expect(validateCase(values({ input: '0', expectedOutput: '' }), rows, null)).toEqual({});
      expect(validateCase(values({ expectedOutput: '  \n' }), rows, null)).toEqual({});
    });

    it('input trống là hợp lệ (bài không đọc input)', () => {
      expect(validateCase(values({ input: '' }), rows, null)).toEqual({});
    });
  });

  describe('nextCaseKey', () => {
    it('đề xuất ca(N+1) theo số lớn nhất đang có, kể cả ca đã bỏ (không tái dùng số đã dùng)', () => {
      expect(nextCaseKey([])).toBe('ca1');
      const rows = startDraft([bundleCase({ caseKey: 'ca2' }), bundleCase({ caseKey: 'ca7' }), bundleCase({ caseKey: 'bien-1' })]);
      expect(nextCaseKey(rows)).toBe('ca8');
      expect(nextCaseKey(removeRow(rows, 1))).toBe('ca8');
    });
  });

  describe('thêm, sửa, bỏ, hoàn tác', () => {
    it('thêm ca → state added, không có trích đề', () => {
      const rows = addRow(startDraft([bundleCase()]), values());
      expect(rows[1]).toMatchObject({ caseKey: 'ca9', state: 'added', constraintQuote: null, base: null });
    });

    it('thêm tự cắt khoảng trắng hai đầu tên ca và nhóm, cắt đuôi output (so sánh bỏ đuôi), giữ nguyên input và đầu output', () => {
      const rows = addRow([], values({ caseKey: ' ca3 ', group: ' bien ', expectedOutput: ' 7 \n', input: ' 1 \n' }));
      expect(rows[0]).toMatchObject({ caseKey: 'ca3', group: 'bien', expectedOutput: ' 7', input: ' 1 \n' });
    });

    it('sửa ca có sẵn → edited và mất trích đề (đề không còn biện minh cho input mới)', () => {
      const rows = editRow(startDraft([bundleCase()]), 0, values({ caseKey: 'ca1', expectedOutput: '7\n' }));
      expect(rows[0]).toMatchObject({ state: 'edited', constraintQuote: null });
      expect(changesCount(rows)).toBe(1);
    });

    it('sửa về đúng giá trị gốc → trở lại same và TRẢ LẠI trích đề gốc (không mất khi sửa rồi hoàn lại)', () => {
      const edited = editRow(startDraft([bundleCase()]), 0, values({ caseKey: 'ca1', expectedOutput: '7\n' }));
      expect(edited[0].constraintQuote).toBeNull();
      const back = editRow(edited, 0, { caseKey: 'ca1', group: 'co_ban', input: '3\n1 2 3\n', expectedOutput: '6' });
      expect(back[0].state).toBe('same');
      expect(back[0].constraintQuote).toBe('Dòng đầu là n (1 ≤ n ≤ 100)');
      expect(changesCount(back)).toBe(0);
    });

    it('bỏ rồi hoàn tác một ca chưa đổi → trích đề gốc còn nguyên', () => {
      const rows = undoRow(removeRow(startDraft([bundleCase()]), 0), 0);
      expect(rows[0]).toMatchObject({ state: 'same', constraintQuote: 'Dòng đầu là n (1 ≤ n ≤ 100)' });
    });

    // Ca hệ thống đã bỏ không có nút nào trong UI, nhưng hàm vẫn không được đưa nó trở lại: nó là ca không chấm được.
    it('bỏ / hoàn tác KHÔNG làm sống lại ca hệ thống đã bỏ (state dropped giữ nguyên)', () => {
      const dropped = startDraft([bundleCase({ caseKey: 'ca9', autoDroppedReason: 'không trích được đề' })]);
      expect(removeRow(dropped, 0)[0].state).toBe('dropped');
      expect(undoRow(dropped, 0)[0].state).toBe('dropped');
      expect(toCreateInput(removeRow(dropped, 0))).toEqual([]);
    });

    it('sửa ca vừa thêm vẫn là added', () => {
      const rows = editRow(addRow([], values()), 0, values({ expectedOutput: '8' }));
      expect(rows[0]).toMatchObject({ state: 'added', expectedOutput: '8' });
    });

    it('bỏ ca vừa thêm → biến mất; bỏ ca có sẵn → removed, hoàn tác được', () => {
      const added = addRow(startDraft([bundleCase()]), values());
      expect(removeRow(added, 1)).toHaveLength(1);
      const removed = removeRow(added, 0);
      expect(removed[0].state).toBe('removed');
      expect(undoRow(removed, 0)[0].state).toBe('same');
    });

    it('hoàn tác một ca đã sửa rồi bỏ → trở lại edited, không về same', () => {
      const rows = removeRow(editRow(startDraft([bundleCase()]), 0, values({ caseKey: 'ca1', expectedOutput: '7' })), 0);
      expect(undoRow(rows, 0)[0].state).toBe('edited');
    });

    it('các hàm không sửa mảng đầu vào', () => {
      const rows = startDraft([bundleCase()]);
      const snapshot = JSON.stringify(rows);
      addRow(rows, values());
      editRow(rows, 0, values({ caseKey: 'ca1' }));
      removeRow(rows, 0);
      expect(JSON.stringify(rows)).toBe(snapshot);
    });
  });

  describe('saveBlocker', () => {
    // Bỏ ca1 rồi thêm một ca1 mới rồi hoàn tác ca1 cũ: hai ca cùng tên cùng đang dùng. Server từ chối bằng lỗi trùng khoá
    // (một thông điệp tiếng Anh), nên phải chặn ngay trong bản nháp với lời nói rõ.
    it('hai ca đang dùng cùng tên → chặn lưu, nói rõ tên trùng', () => {
      const rows0 = startDraft([bundleCase({ caseKey: 'ca1' }), bundleCase({ caseKey: 'ca2', input: '9', expectedOutput: '9' })]);
      const removed = removeRow(rows0, 0);
      const withNew = addRow(removed, values({ caseKey: 'ca1' }));
      const undone = undoRow(withNew, 0);
      expect(undone.filter((r) => r.state !== 'removed' && r.state !== 'dropped').map((r) => r.caseKey)).toEqual(['ca1', 'ca2', 'ca1']);
      expect(saveBlocker(undone, false)).toBe('Có hai ca cùng tên "ca1" trong bản nháp — đổi tên một trong hai.');
    });

    it('đang mở form → chặn; không thay đổi → chặn; hết ca đang dùng → chặn; đủ điều kiện → null', () => {
      const rows = startDraft([bundleCase()]);
      expect(saveBlocker(rows, true)).toMatch(/Lưu hoặc huỷ ca đang nhập/);
      expect(saveBlocker(rows, false)).toMatch(/Chưa có thay đổi/);
      expect(saveBlocker(removeRow(rows, 0), false)).toMatch(/ít nhất một ca/);
      expect(saveBlocker(addRow(rows, values()), false)).toBeNull();
    });

    it('bản nháp rỗng cũng bị chặn vì cần ít nhất một ca', () => {
      expect(saveBlocker([], false)).toMatch(/ít nhất một ca/);
    });
  });

  describe('toCreateInput', () => {
    it('chỉ gửi ca đang dùng; ca same giữ trích đề, ca added/edited không; ca bỏ và ca hệ thống đã bỏ không đi', () => {
      let rows: DraftRow[] = startDraft([
        bundleCase(),
        bundleCase({ caseKey: 'ca2', constraintQuote: 'q2' }),
        bundleCase({ caseKey: 'ca3' }),
        bundleCase({ caseKey: 'ca4', autoDroppedReason: 'x' }),
      ]);
      rows = editRow(rows, 1, values({ caseKey: 'ca2', expectedOutput: '9' }));
      rows = removeRow(rows, 2);
      rows = addRow(rows, values());

      expect(toCreateInput(rows)).toEqual([
        { caseKey: 'ca1', group: 'co_ban', input: '3\n1 2 3\n', expectedOutput: '6\n', constraintQuote: 'Dòng đầu là n (1 ≤ n ≤ 100)' },
        { caseKey: 'ca2', group: 'bien', input: '1\n7\n', expectedOutput: '9' },
        { caseKey: 'ca9', group: 'bien', input: '1\n7\n', expectedOutput: '7' },
      ]);
    });

    it('trích đề dài quá 2000 ký tự (trần của server) bị cắt chứ không làm cả lượt lưu thất bại', () => {
      const rows = startDraft([bundleCase({ constraintQuote: 'x'.repeat(2500) })]);
      const [only] = toCreateInput(addRow(rows, values()));
      expect(only.constraintQuote).toHaveLength(2000);
    });
  });
});
