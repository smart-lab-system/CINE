import { execResult } from '../investigator/testing/fake-sandbox';
import { buildExecRequest, COMPILE_LOG_MAX_CHARS, DIFF_MAX_CHARS, summarizeExec, TEST_RUN_BUDGET_MS } from './run-source';

const CASES = [
  { name: 'cb1', group: 'co_ban', input: '1\n', expected: '1\n' },
  { name: 'bi1', group: 'bien', input: '2\n', expected: '2\n' },
];

describe('buildExecRequest() — job chạy một mã nguồn đáp án', () => {
  it('cpp: một file main.cpp, không driver, không entry, ngân sách mặc định 60 s', () => {
    const r = buildExecRequest('cpp', 'int main(){}', CASES);
    expect(r.language).toBe('cpp');
    expect(r.program).toEqual({ files: [{ path: 'main.cpp', ref: { kind: 'inline', content: 'int main(){}' } }], driver: null, entry: null });
    expect(r.budgetMs).toBe(TEST_RUN_BUDGET_MS);
  });

  it('python: main.py và entry main.py (python không driver thì hợp đồng đòi khai entry)', () => {
    const r = buildExecRequest('python', 'print(1)', CASES);
    expect(r.program).toEqual({ files: [{ path: 'main.py', ref: { kind: 'inline', content: 'print(1)' } }], driver: null, entry: 'main.py' });
  });

  it('mỗi ca mang stdin và expected inline; expected null giữ null (công cụ run: chạy và lấy stdout)', () => {
    const r = buildExecRequest('cpp', 'x', [CASES[0], { name: 'sinh', group: null, input: '9\n', expected: null }]);
    expect(r.cases).toEqual([
      { name: 'cb1', group: 'co_ban', stdin: { kind: 'inline', content: '1\n' }, expected: { kind: 'inline', content: '1\n' } },
      { name: 'sinh', group: null, stdin: { kind: 'inline', content: '9\n' }, expected: null },
    ]);
  });

  it('ngân sách tuỳ chỉnh được truyền xuống', () => {
    expect(buildExecRequest('cpp', 'x', CASES, 5_000).budgetMs).toBe(5_000);
  });
});

describe('summarizeExec() — kết quả worker thành kết cục của lượt chạy', () => {
  const names = CASES.map((c) => c.name);
  const passing = () => execResult(CASES.map((c) => ({ name: c.name, group: c.group, status: 'pass' })));

  it('mọi ca đạt → pass', () => {
    expect(summarizeExec(passing(), names)).toMatchObject({ status: 'pass', compileLog: null });
  });

  it('một ca không đạt → fail, giữ trạng thái từng ca', () => {
    const r = execResult([{ name: 'cb1', status: 'pass' }, { name: 'bi1', status: 'timeout' }]);
    const s = summarizeExec(r, names);
    expect(s.status).toBe('fail');
    expect(s.cases.map((c) => [c.name, c.status])).toEqual([['cb1', 'pass'], ['bi1', 'timeout']]);
  });

  it('output_limit của một ca không làm cả lượt hỏng: vẫn là fail với từng ca nói rõ', () => {
    const r = execResult([{ name: 'cb1', status: 'pass' }, { name: 'bi1', status: 'output_limit', limitsHit: ['output'] }]);
    expect(summarizeExec(r, names)).toMatchObject({ status: 'fail' });
  });

  it('unavailable → unavailable, không ca nào, bất kể trường còn lại', () => {
    const r = execResult([{ name: 'cb1', status: 'pass' }], { unavailable: 'worker chết', host: null });
    expect(summarizeExec(r, names)).toEqual({ status: 'unavailable', cases: [], compileLog: null });
  });

  it('biên dịch hỏng → compile_error kèm log cắt còn trần, không báo fail từng ca', () => {
    const r = execResult([], { compile: { ok: false, log: 'e'.repeat(COMPILE_LOG_MAX_CHARS + 500), ms: 3 } });
    const s = summarizeExec(r, names);
    expect(s.status).toBe('compile_error');
    expect(s.cases).toEqual([]);
    expect(s.compileLog).toHaveLength(COMPILE_LOG_MAX_CHARS);
  });

  it('hết ngân sách (aborted) → aborted, KHÔNG pass dù các ca đã chạy đều đạt', () => {
    const r = execResult([{ name: 'cb1', status: 'pass' }], { aborted: 'budget' });
    const s = summarizeExec(r, names);
    expect(s.status).toBe('aborted');
    expect(s.cases.map((c) => c.name)).toEqual(['cb1']);
  });

  it('worker trả thiếu ca so với yêu cầu mà không báo aborted → vẫn aborted, không pass', () => {
    const r = execResult([{ name: 'cb1', status: 'pass' }]);
    expect(summarizeExec(r, names).status).toBe('aborted');
  });

  it('diff cắt còn trần và stdout KHÔNG được chép sang kết quả', () => {
    const r = execResult([{ name: 'cb1', status: 'fail', diff: 'x'.repeat(900), stdout: 'bí mật' }, { name: 'bi1', status: 'pass' }]);
    const s = summarizeExec(r, names);
    expect(s.cases[0].diff).toHaveLength(DIFF_MAX_CHARS);
    expect(JSON.stringify(s)).not.toContain('bí mật');
    expect(Object.keys(s.cases[0]).sort()).toEqual(['diff', 'ms', 'name', 'status']);
  });
});
