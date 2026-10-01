import { flattenAuthoringCases } from './authoring-bundle';
import type { GeneratedQuestion } from './ai-provider/exam-authoring-provider';

function question(topic: string, cases: { name: string; group: string }[]): GeneratedQuestion {
  return {
    statement: `Câu hỏi về ${topic}`,
    points: 1,
    topic,
    requiredComplexity: null,
    modelAnswer: 'code',
    resemblesKnownProblem: null,
    testBundle: cases.map((c) => ({
      name: c.name,
      group: c.group,
      input: '1 2 3',
      expectedOutput: '6',
    })),
  };
}

describe('flattenAuthoringCases', () => {
  it('làm phẳng nhiều câu thành một danh sách, khoá mang số thứ tự câu', () => {
    const out = flattenAuthoringCases([
      question('nhị phân', [{ name: 'ca1', group: 'co_ban' }]),
      question('đồ thị', [{ name: 'ca1', group: 'co_ban' }]),
    ]);
    expect(out.map((c) => c.caseKey)).toEqual(['q1-ca1', 'q2-ca1']);
    expect(out.every((c) => c.group === 'co_ban')).toBe(true);
  });

  it('bỏ dấu tiếng Việt, khoảng trắng và dấu câu trong tên ca', () => {
    const out = flattenAuthoringCases([
      question('cân bằng', [{ name: 'Ca 1: cân bằng!', group: 'co_ban' }]),
    ]);
    expect(out[0].caseKey).toBe('q1-ca-1-can-bang');
  });

  it('chữ đ được đổi thành d, không bị bỏ mất', () => {
    const out = flattenAuthoringCases([question('đồ thị', [{ name: 'Đồ thị đầy đủ', group: 'co_ban' }])]);
    expect(out[0].caseKey).toBe('q1-do-thi-day-du');
  });

  it('tên rỗng hoặc toàn ký tự lạ -> rơi về q{n}-c{i}', () => {
    const out = flattenAuthoringCases([
      question('rỗng', [
        { name: '', group: 'co_ban' },
        { name: '!!!', group: 'co_ban' },
      ]),
    ]);
    expect(out.map((c) => c.caseKey)).toEqual(['q1-c0', 'q1-c1']);
  });

  // `uq_grading_test_case_key (bundle_id, case_key)` — hai ca trùng tên
  // trong một câu là một INSERT 500 và kéo theo cả lần gắn đề.
  it('hai ca trùng tên trong một câu -> khoá thứ hai có hậu tố', () => {
    const out = flattenAuthoringCases([
      question('trùng', [
        { name: 'x', group: 'co_ban' },
        { name: 'x', group: 'co_ban' },
        { name: 'x', group: 'co_ban' },
      ]),
    ]);
    expect(out.map((c) => c.caseKey)).toEqual(['q1-x', 'q1-x-2', 'q1-x-3']);
  });

  it('khoá dài quá 64 vẫn vượt qua CHECK của DB, kể cả khi có hậu tố', () => {
    const out = flattenAuthoringCases([
      question('dài', Array.from({ length: 12 }, () => ({ name: 'k'.repeat(60), group: 'g' }))),
    ]);
    for (const c of out) {
      expect(c.caseKey.length).toBeLessThanOrEqual(64);
      expect(c.caseKey).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
    expect(new Set(out.map((c) => c.caseKey)).size).toBe(out.length);
  });

  // Hậu tố `-100` dài hơn `-2`: cắt base cố định ở 61 thì khoá thứ 100 thành 65 ký tự và nổ CHECK.
  it('hậu tố nhiều chữ số (từ ca thứ 10, thứ 100) vẫn nằm trong 64 ký tự', () => {
    const out = flattenAuthoringCases([
      question('rất nhiều', Array.from({ length: 120 }, () => ({ name: 'k'.repeat(80), group: 'g' }))),
    ]);
    expect(Math.max(...out.map((c) => c.caseKey.length))).toBeLessThanOrEqual(64);
    expect(new Set(out.map((c) => c.caseKey)).size).toBe(120);
  });

  it('group rỗng hoặc quá dài -> "general", không cắt câm', () => {
    const out = flattenAuthoringCases([
      question('g', [
        { name: 'a', group: '   ' },
        { name: 'b', group: 'x'.repeat(150) },
        { name: 'c', group: 'nhom_bien' },
      ]),
    ]);
    expect(out.map((c) => c.group)).toEqual(['general', 'general', 'nhom_bien']);
  });

  // Đây là hình thức thật của luật: mọi tên do model viết đều phải qua
  // được regex của DB, không phải mấy tên mình chọn.
  it('mọi tên rác đều cho khoá hợp lệ và không trùng', () => {
    const junk = [
      '', '   ', '!!!', 'Câu 1: cân bằng BST', 'a/b\\c', 'null', '0', '-', '_',
      'Đề thi giữa kỳ — phần 2', 'case\u0000with\u0000nulls', '🎉', 'x'.repeat(300),
      'Case 1', 'case 1', 'CASE 1',
    ];
    const questions = junk.map((name, i) =>
      question(`q${i}`, Array.from({ length: 12 }, () => ({ name, group: name || 'g' }))),
    );
    const out = flattenAuthoringCases(questions);
    expect(out.length).toBe(junk.length * 12);
    for (const c of out) expect(c.caseKey).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(new Set(out.map((c) => c.caseKey)).size).toBe(out.length);
  });

  it('câu không có ca nào -> không sinh dòng nào', () => {
    expect(flattenAuthoringCases([question('rỗng', [])])).toEqual([]);
  });
});
