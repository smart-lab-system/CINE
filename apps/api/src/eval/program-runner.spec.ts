import {
  buildRunScript,
  DockerProgramRunner,
  DockerUnavailableError,
  normalizeOutput,
  statusFromExitCode,
} from './program-runner';

describe('normalizeOutput', () => {
  it('CRLF và khoảng trắng cuối dòng không làm lệch so khớp (Review Focus 1)', () => {
    expect(normalizeOutput('1 2 3 \r\n')).toBe(normalizeOutput('1 2 3\n'));
    expect(normalizeOutput('YES\r\n\r\n')).toBe('YES');
  });
  it('khác nội dung thật thì vẫn khác', () => {
    expect(normalizeOutput('1 2 3')).not.toBe(normalizeOutput('1 3 2'));
  });
});

describe('statusFromExitCode', () => {
  it('0 → ok; 124 → timeout; 153 (SIGXFSZ) → output_limit; khác → runtime_crash', () => {
    expect(statusFromExitCode(0)).toBe('ok');
    expect(statusFromExitCode(124)).toBe('timeout');
    expect(statusFromExitCode(153)).toBe('output_limit');
    expect(statusFromExitCode(1)).toBe('runtime_crash');
    expect(statusFromExitCode(134)).toBe('runtime_crash');
  });
});

describe('buildRunScript', () => {
  const script = buildRunScript();
  it('biên dịch có sanitizer và tắt LeakSanitizer (§3.5)', () => {
    expect(script).toContain('-std=c++17 -O2 -fsanitize=address,undefined -fno-sanitize-recover=all');
    expect(script).toContain('ASAN_OPTIONS=detect_leaks=0');
  });
  it('mỗi ca có trần thời gian và trần kích thước output', () => {
    // -k 1: bài chặn SIGTERM vẫn bị KILL sau 1 giây, không treo cả lượt kiểm.
    expect(script).toMatch(/timeout -k 1 \d+ /);
    expect(script).toContain('ulimit -f');
  });
  it('dùng LF, không CRLF — sh trong container không hiểu \\r', () => {
    expect(script).not.toContain('\r');
  });
});

describe('DockerProgramRunner', () => {
  it('Docker không chạy → DockerUnavailableError nói đúng tên sự cố (Review Focus 2)', async () => {
    const runner = new DockerProgramRunner({ dockerBin: 'docker-khong-ton-tai-xyz' });
    await expect(
      runner.run({ driver: '', source: '', cases: [] }),
    ).rejects.toThrow(DockerUnavailableError);
    await expect(runner.run({ driver: '', source: '', cases: [] })).rejects.toThrow(/Docker không chạy/);
  });
});
