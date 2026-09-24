import { classifyExit, isDockerFailure } from './classify';

const base = {
  exitCode: 0, oomKilled: false as boolean | null, outputTruncated: false, language: 'cpp' as const,
  elapsedMs: 100, wallMs: 2_000,
};

describe('classifyExit', () => {
  it('0 → ran', () => expect(classifyExit(base)).toEqual({ status: 'ran', limitsHit: [] }));
  it('124 (timeout) → timeout', () => expect(classifyExit({ ...base, exitCode: 124 }).status).toBe('timeout'));
  it('OOM → runtime_crash + memory', () =>
    expect(classifyExit({ ...base, exitCode: 137, oomKilled: true })).toEqual({ status: 'runtime_crash', limitsHit: ['memory'] }));
  it('137 sau khi đã chạy hết trần → bài chặn SIGTERM, bị KILL sau ân hạn → timeout (đã đo)', () =>
    expect(classifyExit({ ...base, exitCode: 137, elapsedMs: 3_500 })).toEqual({ status: 'timeout', limitsHit: ['time'] }));
  it('137 sớm, docker nói không OOM → runtime_crash, không gán trần nào', () =>
    expect(classifyExit({ ...base, exitCode: 137 })).toEqual({ status: 'runtime_crash', limitsHit: [] }));
  it('137 sớm qua docker exec (không có cờ OOM để hỏi) → coi là chạm trần RAM', () =>
    expect(classifyExit({ ...base, exitCode: 137, oomKilled: null }).limitsHit).toEqual(['memory']));
  it('vượt trần output thắng mọi mã thoát', () =>
    expect(classifyExit({ ...base, exitCode: 0, outputTruncated: true }).status).toBe('output_limit'));
  it('Python 86 → recursion_limit; C++ 86 → runtime_crash', () => {
    expect(classifyExit({ ...base, language: 'python', exitCode: 86 }).status).toBe('recursion_limit');
    expect(classifyExit({ ...base, exitCode: 86 }).status).toBe('runtime_crash');
  });
  it('mã khác 0 còn lại (ASan, UBSan, main trả 1) → runtime_crash', () =>
    expect(classifyExit({ ...base, exitCode: 1 }).status).toBe('runtime_crash'));
});

describe('isDockerFailure — Review Focus 2', () => {
  it('125 kèm lời của daemon → lỗi hạ tầng', () => {
    expect(isDockerFailure(125, 'docker: Error response from daemon: …')).toBe(true);
  });
  it('bài tự thoát 125 mà không có lời của docker → không phải lỗi hạ tầng', () => {
    expect(isDockerFailure(125, 'Segmentation fault')).toBe(false);
  });
  it('mã thường → không phải', () => expect(isDockerFailure(1, 'docker: x')).toBe(false));
});
