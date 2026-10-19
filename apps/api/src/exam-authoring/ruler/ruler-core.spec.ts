import { ExecResult } from '../../sandbox/contract';
import { execResult } from '../../grading/investigator/testing/fake-sandbox';
import {
  CaseProposal,
  checkExamples,
  coverageWarnings,
  interpretRuns,
  LARGE_INPUT_CHARS,
  normalizeForQuote,
  normalizeGroup,
  prefilterCases,
  quoteAppearsInStatement,
  sameOutput,
  STDOUT_LIMIT,
} from './ruler-core';

const STATEMENT = 'Cho n số nguyên. In ra các số theo thứ tự ngược lại. Ràng buộc: 0 ≤ n ≤ 1000, mỗi số có giá trị tuyệt đối không quá 10^12.';
const caseOf = (over: Partial<CaseProposal> = {}): CaseProposal => ({
  name: 'ca co ban',
  group: 'co_ban',
  input: '3\n1 2 3\n',
  quote: 'In ra các số theo thứ tự ngược lại',
  answerIsUnique: true,
  ...over,
});

describe('normalizeForQuote() / quoteAppearsInStatement() — trích đề sau chuẩn hoá NFC và gộp khoảng trắng', () => {
  it('gộp mọi khoảng trắng, xuống dòng và tab thành một dấu cách, và cắt hai đầu', () => {
    expect(normalizeForQuote('  a\n\tb   c \r\n')).toBe('a b c');
  });

  it('NFC: chữ có dấu tổ hợp và dựng sẵn coi là một', () => {
    const decomposed = 'người'.normalize('NFD');
    expect(normalizeForQuote(decomposed)).toBe(normalizeForQuote('người'));
    expect(quoteAppearsInStatement('Cho n số nguyên', 'Cho n số nguyên. In ra'.normalize('NFD'))).toBe(true);
  });

  it('trích dẫn khớp dù khác khoảng trắng hay xuống dòng với đề', () => {
    expect(quoteAppearsInStatement('In ra các số\n  theo thứ tự ngược lại', STATEMENT)).toBe(true);
  });

  it('không có trong đề → false', () => {
    expect(quoteAppearsInStatement('Sắp xếp tăng dần mảng đã cho', STATEMENT)).toBe(false);
  });

  it('quá ngắn hay rỗng không tính là trích dẫn (một ký tự khớp mọi đề)', () => {
    expect(quoteAppearsInStatement('', STATEMENT)).toBe(false);
    expect(quoteAppearsInStatement('  ', STATEMENT)).toBe(false);
    expect(quoteAppearsInStatement('a', STATEMENT)).toBe(false);
  });
});

describe('normalizeGroup()', () => {
  it.each([
    ['biên', 'bien'],
    ['Co Ban', 'co_ban'],
    ['co-ban', 'co_ban'],
    ['  ', 'co_ban'],
    ['', 'co_ban'],
    ['LỚN', 'lon'],
    ['!!!', 'co_ban'],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeGroup(raw)).toBe(expected);
  });

  it('cắt còn 100 ký tự (CHECK của DB)', () => {
    expect(normalizeGroup('a'.repeat(300))).toHaveLength(100);
  });
});

describe('prefilterCases() — lọc TRƯỚC khi chạy', () => {
  it('ca hợp lệ được giữ, khoá là slug an toàn của tên (bỏ dấu, ASCII, đúng regex case_key)', () => {
    const r = prefilterCases([caseOf({ name: 'Ca biên lớn!' })], STATEMENT, 200);
    expect(r.dropped).toEqual([]);
    expect(r.kept).toEqual([{ key: 'ca-bien-lon', group: 'co_ban', input: '3\n1 2 3\n', quote: 'In ra các số theo thứ tự ngược lại' }]);
    expect(r.kept[0].key).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it('tên trùng nhau → hậu tố -2, -3; tên rỗng hay toàn dấu → ca-<thứ tự>', () => {
    const r = prefilterCases([caseOf({ name: 'x' }), caseOf({ name: 'x' }), caseOf({ name: 'x' }), caseOf({ name: '???' })], STATEMENT, 200);
    expect(r.kept.map((c) => c.key)).toEqual(['x', 'x-2', 'x-3', 'ca-4']);
  });

  it('tên dài hơn 64 ký tự bị cắt, vẫn duy nhất', () => {
    const long = 'a'.repeat(100);
    const r = prefilterCases([caseOf({ name: long }), caseOf({ name: long })], STATEMENT, 200);
    expect(r.kept.every((c) => c.key.length <= 64)).toBe(true);
    expect(new Set(r.kept.map((c) => c.key)).size).toBe(2);
  });

  it('ca không trích được câu nào trong đề bị bỏ, nêu lý do', () => {
    const r = prefilterCases([caseOf({ name: 'bịa', quote: 'Tính tổng hai số a và b' })], STATEMENT, 200);
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => [d.name, d.reason])).toEqual([['bịa', expect.stringMatching(/trích/)]]);
  });

  it('ca bị bỏ vẫn mang khoá, nhóm và input để lưu vào gói kèm lý do (giảng viên thấy vì sao bỏ)', () => {
    const r = prefilterCases([caseOf({ name: 'Bịa', quote: 'Tính tổng hai số a và b', group: 'Biên', input: '7\n' })], STATEMENT, 200);
    expect(r.dropped[0]).toMatchObject({ name: 'Bịa', key: 'bia', group: 'bien', input: '7\n' });
  });

  it('answerIsUnique=false bị bỏ (chưa có bộ so sánh phù hợp cho gói)', () => {
    const r = prefilterCases([caseOf({ name: 'nhieu-dap-an', answerIsUnique: false })], STATEMENT, 200);
    expect(r.kept).toEqual([]);
    expect(r.dropped[0]).toMatchObject({ name: 'nhieu-dap-an', reason: expect.stringMatching(/không duy nhất/) });
  });

  it('input quá 4 MiB bị bỏ', () => {
    const r = prefilterCases([caseOf({ name: 'to', input: 'x'.repeat(4 * 1024 * 1024 + 1) })], STATEMENT, 200);
    expect(r.kept).toEqual([]);
    expect(r.dropped[0].reason).toMatch(/4 MiB/);
  });

  it('quá trần số ca: giữ đủ trần theo thứ tự, phần dư bị bỏ với lý do vượt trần', () => {
    const many = Array.from({ length: 5 }, (_, i) => caseOf({ name: `c${i}` }));
    const r = prefilterCases(many, STATEMENT, 3);
    expect(r.kept.map((c) => c.key)).toEqual(['c0', 'c1', 'c2']);
    expect(r.dropped.map((d) => d.name)).toEqual(['c3', 'c4']);
    expect(r.dropped[0].reason).toMatch(/trần/);
  });

  it('lý do bỏ không chứa nội dung input (input có thể là dữ liệu nhạy)', () => {
    const r = prefilterCases([caseOf({ name: 'bịa', quote: 'Tính tổng hai số a và b', input: 'BÍ-MẬT-INPUT' })], STATEMENT, 200);
    expect(JSON.stringify(r.dropped.map((d) => d.reason))).not.toContain('BÍ-MẬT-INPUT');
  });
});

describe('interpretRuns() — hai lượt chạy đáp án thành output ổn định', () => {
  const ran = (name: string, stdout: string | null, status = 'ran') => ({ name, status, stdout });
  const run = (cases: { name: string; status: string; stdout: string | null }[], over: Partial<ExecResult> = {}) =>
    execResult(cases as Parameters<typeof execResult>[0], over);

  it('hai lượt cho cùng stdout → ổn định, lấy stdout đó', () => {
    const r = interpretRuns(run([ran('a', '3 2 1\n')]), run([ran('a', '3 2 1\n')]), ['a']);
    expect(r.stable.get('a')).toBe('3 2 1\n');
    expect(r.dropped).toEqual([]);
  });

  it('hai lượt khác nhau → bỏ ca, lý do nondeterministic', () => {
    const r = interpretRuns(run([ran('a', '1\n')]), run([ran('a', '2\n')]), ['a']);
    expect(r.stable.size).toBe(0);
    expect(r.dropped).toEqual([{ name: 'a', reason: expect.stringMatching(/nondeterministic/) }]);
  });

  it.each(['runtime_crash', 'timeout', 'recursion_limit'])('trạng thái %s ở một lượt → bỏ ca, lý do là trạng thái', (status) => {
    const r = interpretRuns(run([ran('a', null, status)]), run([ran('a', '1\n')]), ['a']);
    expect(r.dropped).toEqual([{ name: 'a', reason: expect.stringContaining(status) }]);
  });

  it('output_limit hay stdout đạt trần 64 KiB → bỏ ca, lý do output vượt 64 KiB', () => {
    const a = interpretRuns(run([ran('a', null, 'output_limit')]), run([ran('a', null, 'output_limit')]), ['a']);
    expect(a.dropped[0].reason).toMatch(/64 KiB/);
    const big = 'x'.repeat(STDOUT_LIMIT);
    const b = interpretRuns(run([ran('a', big)]), run([ran('a', big)]), ['a']);
    expect(b.dropped[0].reason).toMatch(/64 KiB/);
  });

  it('thiếu kết quả của ca ở một lượt → bỏ, lý do không có kết quả', () => {
    const r = interpretRuns(run([ran('a', '1\n')]), run([]), ['a']);
    expect(r.dropped).toEqual([{ name: 'a', reason: expect.stringMatching(/không có kết quả/) }]);
  });

  it('stdout null ở ca đáng lẽ chạy → bỏ, không ghi expected rỗng', () => {
    const r = interpretRuns(run([ran('a', null)]), run([ran('a', null)]), ['a']);
    expect(r.stable.size).toBe(0);
    expect(r.dropped).toHaveLength(1);
  });

  it('chỉ xét các ca được hỏi, theo thứ tự hỏi', () => {
    const r = interpretRuns(run([ran('a', '1\n'), ran('b', '2\n')]), run([ran('a', '1\n'), ran('b', '2\n')]), ['b']);
    expect([...r.stable.keys()]).toEqual(['b']);
  });
});

describe('sameOutput() — cùng chuẩn hoá với comparator exact của worker', () => {
  it('bỏ qua CRLF, khoảng trắng cuối dòng và xuống dòng cuối', () => {
    expect(sameOutput('1 2 3  \r\n4\r\n\r\n', '1 2 3\n4')).toBe(true);
  });
  it('khác nội dung → false; khác khoảng trắng GIỮA dòng → false', () => {
    expect(sameOutput('1 2', '1  2')).toBe(false);
    expect(sameOutput('1', '2')).toBe(false);
  });
});

describe('checkExamples() — ví dụ vào/ra trong đề', () => {
  const ex = (output: string, over = {}) => ({ input: '3\n1 2 3\n', output, quote: 'In ra các số theo thứ tự ngược lại', ...over });

  it('mọi ví dụ khớp (chịu CRLF và khoảng trắng cuối) → checked > 0, không lệch', () => {
    const r = checkExamples([ex('3 2 1\n'), ex('3 2 1 \r\n')], STATEMENT, (i) => (i === 0 ? '3 2 1\n' : '3 2 1\n'));
    expect(r).toEqual({ checked: 2, mismatches: [] });
  });

  it('một ví dụ lệch → báo đích danh, kèm kỳ vọng và thực tế', () => {
    const r = checkExamples([ex('3 2 1\n')], STATEMENT, () => '1 2 3\n');
    expect(r.checked).toBe(1);
    expect(r.mismatches).toEqual([{ index: 0, input: '3\n1 2 3\n', expected: '3 2 1\n', actual: '1 2 3\n' }]);
  });

  it('ví dụ không trích được đề không được tin: không tính vào checked', () => {
    const r = checkExamples([ex('9\n', { quote: 'Một câu không có trong đề này' })], STATEMENT, () => '1\n');
    expect(r).toEqual({ checked: 0, mismatches: [] });
  });

  it('ví dụ mà đáp án không chạy ra stdout (null) → tính là lệch, không âm thầm bỏ qua', () => {
    const r = checkExamples([ex('3 2 1\n')], STATEMENT, () => null);
    expect(r.mismatches).toHaveLength(1);
  });

  it('không có ví dụ → checked 0 (thước chỉ có thể unverified)', () => {
    expect(checkExamples([], STATEMENT, () => '')).toEqual({ checked: 0, mismatches: [] });
  });
});

describe('coverageWarnings() — độ phủ của gói', () => {
  const kept = (n: number, extra: { group?: string; big?: boolean } = {}) =>
    Array.from({ length: n }, (_, i) => ({
      group: i === 0 ? (extra.group ?? 'bien') : 'co_ban',
      input: i === 1 && extra.big !== false ? 'x'.repeat(LARGE_INPUT_CHARS) : '1\n',
    }));

  it('đủ 5 ca, có nhóm bien và ca lớn, giữ trên nửa → không cảnh báo', () => {
    expect(coverageWarnings(6, kept(6), [])).toEqual([]);
  });

  it('dưới 5 ca → cảnh báo kèm số ca và danh sách ca bị bỏ', () => {
    const w = coverageWarnings(8, kept(3), [{ name: 'x', reason: 'không trích được đề' }]);
    expect(w.join(' ')).toMatch(/3/);
    expect(w.join(' ')).toMatch(/x: không trích được đề/);
  });

  it('giữ dưới một nửa số ca đề xuất → cảnh báo, kể cả khi trên 5 ca', () => {
    expect(coverageWarnings(20, kept(6), []).length).toBeGreaterThan(0);
  });

  it('thiếu nhóm bien → cảnh báo nhóm', () => {
    expect(coverageWarnings(6, kept(6, { group: 'co_ban' }), []).join(' ')).toMatch(/bien/);
  });

  it('thiếu ca lớn → cảnh báo', () => {
    expect(coverageWarnings(6, kept(6, { big: false }), []).join(' ')).toMatch(/lớn/);
  });
});
