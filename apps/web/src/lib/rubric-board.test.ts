import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criterion, overview, session } from '@/app/teacher/rules/_components/fixtures';
import {
  MANY,
  NO_SEMESTER,
  NO_SESSION_IMPACT,
  RECENT_STORED,
  capNames,
  copyPreviewText,
  copySources,
  copyStats,
  filterCounts,
  fold,
  impactLines,
  inSemester,
  overCap,
  pickRubrics,
  pushRecent,
  readRecent,
  scopeLine,
  semesterChoices,
  semesterLabel,
  shorten,
  statusOf,
  tasksOf,
  warningSentences,
  writeRecent,
} from './rubric-board';

const todo = (name: string, over = {}) => overview({ rubricName: name, unpricedCount: 1, ...over });
const fresh = (name: string, over = {}) => overview({ rubricName: name, criteria: [criterion({ errorCount: 0 })], ...over });
const ready = (name: string, over = {}) => overview({ rubricName: name, ...over });

describe('statusOf — bảng chân trị 16 tổ hợp việc cần làm (T-RBE-UI-1)', () => {
  const combos = Array.from({ length: 16 }, (_, i) => ({ empty: !!(i & 1), unpriced: !!(i & 2), proposals: !!(i & 4), dangling: !!(i & 8) }));
  it.each(combos)('tiêu chí rỗng=$empty chưa điểm trừ=$unpriced đề xuất=$proposals mồ côi=$dangling', ({ empty, unpriced, proposals, dangling }) => {
    const criteria = [criterion({ key: 'a', errorCount: 2 }), criterion({ key: 'b', errorCount: empty ? 0 : 1 })];
    const o = overview({ criteria, unpricedCount: unpriced ? 1 : 0, proposalCount: proposals ? 3 : 0, danglingCount: dangling ? 2 : 0 });
    const n = [empty, unpriced, proposals, dangling].filter(Boolean).length;
    const s = statusOf(o);
    expect(s.tasks).toHaveLength(n);
    expect(s.status).toBe(n === 0 ? 'ready' : 'todo');
    expect(s.label).toBe(n === 0 ? 'Sẵn sàng chấm tự động' : `Còn ${n} việc`);
  });

  it('chưa có lỗi nào và chưa phải mọi tiêu chí đều không trừ điểm → "new", dù còn việc khác', () => {
    const o = overview({ criteria: [criterion({ errorCount: 0 }), criterion({ key: 'b', errorCount: 0, waiverId: 'w1' })], proposalCount: 3 });
    expect(statusOf(o)).toMatchObject({ status: 'new', label: 'Chưa có lỗi nào' });
  });

  it('mọi tiêu chí đều đã đánh dấu không trừ điểm và không có lỗi → "ready"', () => {
    const o = overview({ criteria: [criterion({ errorCount: 0, waiverId: 'w1' })] });
    expect(statusOf(o).status).toBe('ready');
  });

  it('một tiêu chí đã đánh dấu thì không tính là tiêu chí rỗng', () => {
    const o = overview({ criteria: [criterion({ key: 'a', errorCount: 1 }), criterion({ key: 'b', errorCount: 0, waiverId: 'w1' })] });
    expect(tasksOf(o)).toEqual([]);
  });

  it('tiêu chí rỗng mang đủ thông tin để cuộn tới nó', () => {
    const o = overview({ criteria: [criterion({ key: 'a', errorCount: 1 }), criterion({ key: 'b', description: 'Trình bày', errorCount: 0 })] });
    const [task] = tasksOf(o);
    expect(task).toMatchObject({ kind: 'empty_criteria' });
    expect(task.kind === 'empty_criteria' && task.criteria.map((c) => c.key)).toEqual(['b']);
  });
});

describe('warningSentences — nuôi dòng "Bảng lỗi" của màn chuẩn bị chấm', () => {
  it('sẵn sàng → không câu nào', () => {
    expect(warningSentences(ready('A'))).toEqual([]);
  });
  it('rubric mới → một câu nói bài sẽ vào "Cần bạn xem"', () => {
    expect(warningSentences(fresh('A'))).toEqual([
      'Rubric này chưa có lỗi nào — mọi bài chấm theo rubric này sẽ chuyển sang “Cần bạn xem” thay vì tự duyệt.',
    ]);
  });
  it('mỗi loại việc một câu, theo thứ tự', () => {
    const o = overview({
      criteria: [criterion({ key: 'a', errorCount: 1 }), criterion({ key: 'b', description: 'Trình bày', errorCount: 0 })],
      unpricedCount: 2,
      proposalCount: 1,
      danglingCount: 3,
    });
    expect(warningSentences(o)).toEqual([
      'Tiêu chí Trình bày chưa có lỗi nào — bài dính tiêu chí đó không tự quyết.',
      '2 lỗi chưa có điểm trừ — bài dính chúng sẽ vào nhóm cần bạn xem.',
      '1 lỗi AI đề xuất chưa xử lý — đang bị loại khỏi điểm.',
      '3 lỗi gắn tiêu chí không còn trong rubric — chuyển sang tiêu chí khác.',
    ]);
  });
});

describe('chuỗi', () => {
  it('fold bỏ dấu, đ → d, không phân biệt hoa thường', () => {
    expect(fold('Cuối KỲ — Đồ thị')).toBe('cuoi ky — do thi');
  });
  it('capNames chặn trần danh sách', () => {
    expect(capNames(['A', 'B'])).toBe('A, B');
    expect(capNames(['A', 'B', 'C', 'D'])).toBe('A, B và 2 rubric khác');
    expect(capNames(['P1', 'P2', 'P3'], 2, 'phiên')).toBe('P1, P2 và 1 phiên khác');
  });
  it('shorten cắt tên tiêu chí dài, giữ nguyên tên ngắn', () => {
    expect(shorten('Trình bày')).toBe('Trình bày');
    expect(shorten('x'.repeat(60), 10)).toBe('xxxxxxxxx…');
  });
});

describe('học kỳ (D8)', () => {
  const all = [
    ready('A', { sessions: [session({ semesterName: 'HK1 2026-2027' }), session({ id: 's2', semesterName: 'HK2 2025-2026' })] }),
    ready('B', { sessions: [session({ id: 's3', semesterName: 'HK1 2025-2026' })] }),
    ready('C'),
  ];
  it('danh sách học kỳ dựng từ phiên, mới nhất trước (năm rồi HK), "Chưa gắn học kỳ" cuối', () => {
    expect(semesterChoices(all)).toEqual([
      { value: null, label: 'Tất cả học kỳ', count: 3 },
      { value: 'HK1 2026-2027', label: 'HK1 2026-2027', count: 1 },
      { value: 'HK2 2025-2026', label: 'HK2 2025-2026', count: 1 },
      { value: 'HK1 2025-2026', label: 'HK1 2025-2026', count: 1 },
      { value: NO_SEMESTER, label: 'Chưa gắn học kỳ', count: 1 },
    ]);
  });
  it('một rubric thuộc MỌI học kỳ nó từng được dùng; chưa gắn phiên nào thì thuộc "chưa gắn"', () => {
    expect(inSemester(all, 'HK2 2025-2026').map((o) => o.rubricName)).toEqual(['A']);
    expect(inSemester(all, NO_SEMESTER).map((o) => o.rubricName)).toEqual(['C']);
    expect(inSemester(all, null)).toHaveLength(3);
  });
  it('nhãn', () => {
    expect(semesterLabel(null)).toBe('Tất cả học kỳ');
    expect(semesterLabel(NO_SEMESTER)).toBe('Chưa gắn học kỳ');
    expect(semesterLabel('HK1 2026-2027')).toBe('HK1 2026-2027');
  });
});

describe('ô chọn rubric (T-RBE-UI-1)', () => {
  const all = [
    todo('Giữa kỳ CTDL', { sessions: [session({ semesterName: 'HK1 2026-2027' })] }),
    fresh('Cuối kỳ CTDL'),
    ready('Thực hành — Hàng đợi', { sessions: [session({ id: 's2', semesterName: 'HK2 2025-2026' })] }),
    ready('Bài tập lớn — Đồ thị'),
  ];
  const q = (over = {}) => ({ q: '', filter: 'all' as const, sort: 'recent' as const, sem: null, ...over });
  const names = (list: { rubricName: string }[]) => list.map((o) => o.rubricName);

  it('ngưỡng chuyển sang ô chọn là 4', () => {
    expect(MANY).toBe(4);
  });
  it('tìm không phân biệt dấu và đ → d', () => {
    expect(names(pickRubrics(all, q({ q: 'cuoi ky' }), []))).toEqual(['Cuối kỳ CTDL']);
    expect(names(pickRubrics(all, q({ q: 'do thi' }), []))).toEqual(['Bài tập lớn — Đồ thị']);
    expect(pickRubrics(all, q({ q: 'khong co' }), [])).toEqual([]);
  });
  it('lọc theo tình trạng', () => {
    expect(names(pickRubrics(all, q({ filter: 'todo' }), []))).toEqual(['Giữa kỳ CTDL']);
    expect(names(pickRubrics(all, q({ filter: 'new' }), []))).toEqual(['Cuối kỳ CTDL']);
    expect(names(pickRubrics(all, q({ filter: 'ready' }), []))).toEqual(['Thực hành — Hàng đợi', 'Bài tập lớn — Đồ thị']);
  });
  it('hợp của học kỳ + tình trạng + từ khoá', () => {
    expect(names(pickRubrics(all, q({ sem: 'HK2 2025-2026', filter: 'ready', q: 'hang doi' }), []))).toEqual(['Thực hành — Hàng đợi']);
    expect(pickRubrics(all, q({ sem: 'HK2 2025-2026', filter: 'todo' }), [])).toEqual([]);
  });
  it('sắp "gần đây": theo lịch sử đã mở, rồi theo thứ tự lưu mới nhất của máy chủ', () => {
    expect(names(pickRubrics(all, q(), ['Bài tập lớn — Đồ thị', 'Cuối kỳ CTDL']))).toEqual([
      'Bài tập lớn — Đồ thị',
      'Cuối kỳ CTDL',
      'Giữa kỳ CTDL',
      'Thực hành — Hàng đợi',
    ]);
  });
  it('sắp A–Z theo locale vi', () => {
    expect(names(pickRubrics(all, q({ sort: 'name' }), []))).toEqual(['Bài tập lớn — Đồ thị', 'Cuối kỳ CTDL', 'Giữa kỳ CTDL', 'Thực hành — Hàng đợi']);
  });
  it('sắp "cần làm trước": todo, rồi new, rồi ready', () => {
    expect(names(pickRubrics(all, q({ sort: 'todo' }), []))).toEqual(['Giữa kỳ CTDL', 'Cuối kỳ CTDL', 'Thực hành — Hàng đợi', 'Bài tập lớn — Đồ thị']);
  });
  it('số trên các nút lọc đếm theo học kỳ đang chọn', () => {
    expect(filterCounts(all, null)).toEqual({ all: 4, todo: 1, ready: 2, new: 1 });
    expect(filterCounts(all, 'HK1 2026-2027')).toEqual({ all: 1, todo: 1, ready: 0, new: 0 });
  });
});

describe('lịch sử "gần đây" (D7)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('pushRecent đưa lên đầu, bỏ trùng, giữ tối đa 8', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    const long = Array.from({ length: 12 }, (_, i) => `r${i}`);
    expect(pushRecent(long, 'mới')).toHaveLength(RECENT_STORED);
  });
  it('lưu theo giảng viên: hai tài khoản trên cùng máy không thấy lịch sử của nhau', () => {
    writeRecent('t1', ['x', 'y']);
    expect(readRecent('t1')).toEqual(['x', 'y']);
    expect(readRecent('t2')).toEqual([]);
    expect(readRecent(null)).toEqual([]);
  });
  it('dữ liệu hỏng thì coi như rỗng', () => {
    localStorage.setItem('rules.recent.t1', '{không phải json');
    expect(readRecent('t1')).toEqual([]);
    localStorage.setItem('rules.recent.t1', '{"a":1}');
    expect(readRecent('t1')).toEqual([]);
    localStorage.setItem('rules.recent.t1', '["ok", 5, null]');
    expect(readRecent('t1')).toEqual(['ok']);
  });
  it('trình duyệt chặn lưu trữ (chế độ riêng tư) → không ném lỗi, trả rỗng (Review Focus 3)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(readRecent('t1')).toEqual([]);
    expect(() => writeRecent('t1', ['x'])).not.toThrow();
  });
});

describe('sao chép lỗi từ rubric khác (D3, T-RBE-UI-3)', () => {
  const source = overview({
    rubricName: 'Nguồn',
    criteria: [criterion({ key: 'a', errorCount: 3 }), criterion({ key: 'b', errorCount: 2 }), criterion({ key: 'c', errorCount: 0 }), criterion({ key: 'd', errorCount: 4 })],
  });
  const target = fresh('Đích', { criteria: [criterion({ key: 'a', errorCount: 0 }), criterion({ key: 'b', errorCount: 0 }), criterion({ key: 'c', errorCount: 0 })] });

  it('nguồn hợp lệ: rubric khác có ít nhất một lỗi', () => {
    expect(copySources([source, target, fresh('Trống')], 'Đích').map((o) => o.rubricName)).toEqual(['Nguồn']);
  });
  it('đếm lỗi sẽ chép, tiêu chí trùng khoá, và lỗi bị bỏ vì đích không có tiêu chí đó', () => {
    expect(copyStats(source, target)).toEqual({ errors: 5, criteria: 2, skipped: 4 });
  });
  it('câu xem trước', () => {
    expect(copyPreviewText({ errors: 5, criteria: 2, skipped: 4 })).toBe(
      'Sẽ sao chép 5 lỗi vào 2 tiêu chí trùng tên, giữ nguyên điểm trừ để bạn chỉnh cho kỳ này. 4 lỗi thuộc tiêu chí không có ở rubric này sẽ không được sao chép. Sau khi sao chép, hai rubric độc lập.',
    );
    expect(copyPreviewText({ errors: 1, criteria: 1, skipped: 0 })).not.toMatch(/không được sao chép/);
  });
});

describe('"Lưu thì áp vào đâu" (spec 1.1, không gọi API)', () => {
  const sessions = [
    session({ id: 'a', name: 'Ca sáng', state: 'grading', resultCount: 38 }),
    session({ id: 'b', name: 'Ca chiều', state: 'finalized', resultCount: 41 }),
    session({ id: 'c', name: 'Ca tối', state: 'not_started', resultCount: 0 }),
  ];
  it('chưa gắn phiên nào', () => {
    expect(impactLines([], 'auto')).toEqual([]);
    expect(NO_SESSION_IMPACT).toMatch(/chưa gắn phiên thi nào/);
  });
  it('Tự động: tính lại ngay phiên đang chấm; phiên đã chốt giữ nguyên; phiên chưa chấm thì dùng khi bắt đầu', () => {
    expect(impactLines(sessions, 'auto').map((l) => l.text)).toEqual([
      'Tính lại ngay các bài dính lỗi này (trong 38 bài).',
      'Giữ nguyên điểm — bảng điểm trừ đã được ghim lúc chốt.',
      'Chưa chấm bài nào — lỗi sẽ được dùng khi bắt đầu chấm.',
    ]);
  });
  it('AI đọc bài: không tính lại bài đã chấm (T-FAIR-1)', () => {
    expect(impactLines(sessions, 'ai')[0].text).toBe('AI xét lỗi này từ các bài chưa chấm; bài đã chấm không tính lại.');
  });
  it('scopeLine gộp theo phiên đang chấm / đã chốt và chặn trần tên phiên', () => {
    expect(scopeLine(sessions, 'auto')).toBe('Ca sáng (đang chấm): tính lại ngay các bài dính lỗi; Ca chiều (đã chốt) giữ nguyên.');
    expect(scopeLine(sessions, 'ai')).toBe('Ca sáng (đang chấm): AI xét theo mô tả mới, từ các bài chưa chấm; Ca chiều (đã chốt) giữ nguyên.');
    expect(scopeLine([], 'auto')).toBe('chưa có phiên đang chấm.');
    const many = ['P1', 'P2', 'P3', 'P4'].map((name, i) => session({ id: `m${i}`, name, state: 'grading' }));
    expect(scopeLine(many, 'auto')).toMatch(/^P1, P2 và 2 phiên khác \(đang chấm\)/);
  });
});

describe('overCap — lời nhắc khi cộng các điểm trừ vượt điểm tối đa', () => {
  it('trả tổng khi vượt, null khi không', () => {
    expect(overCap(['2.00', '1.50', '1.00'], 4)).toBe(4.5);
    expect(overCap(['2.00'], 4)).toBeNull();
    expect(overCap(['2.00', '2.00'], 4)).toBeNull();
    expect(overCap(['2.00', null, '3.00'], 4)).toBe(5);
    expect(overCap([], 4)).toBeNull();
  });
});
