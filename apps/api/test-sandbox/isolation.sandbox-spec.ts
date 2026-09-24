import { randomUUID } from 'node:crypto';
import { handleExec } from '../src/sandbox-worker/handle-exec';
import { execJobOf, inline, realDeps } from './helpers';

const deps = realDeps();
const cpp = (code: string, cases: unknown[], extra: Record<string, unknown> = {}) =>
  handleExec(
    execJobOf({ language: 'cpp', program: { files: [{ path: 'main.cpp', ref: inline(code) }], driver: null, entry: null }, cases, ...extra }),
    deps,
    null,
  );
const py = (code: string, cases: unknown[], extra: Record<string, unknown> = {}) =>
  handleExec(
    execJobOf({ language: 'python', program: { files: [{ path: 'bai.py', ref: inline(code) }], driver: null, entry: 'bai.py' }, cases, ...extra }),
    deps,
    null,
  );
const one = (expected: string | null, stdin = '') => [{ name: 'a', group: null, stdin: inline(stdin), expected: expected === null ? null : inline(expected) }];

describe('T-ISO — mô hình đe doạ (§3.5)', () => {
  it('T-ISO-1 — mở kết nối mạng thất bại (C++ và Python)', async () => {
    const c = await cpp(
      `#include <arpa/inet.h>
#include <cstdio>
#include <netinet/in.h>
#include <sys/socket.h>
int main() {
  int s = socket(AF_INET, SOCK_STREAM, 0);
  if (s < 0) { std::puts("NO_NET"); return 0; }
  sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons(53);
  inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
  std::puts(connect(s, (sockaddr*)&a, sizeof a) == 0 ? "NET_OK" : "NO_NET");
}
`,
      one('NO_NET\n'),
    );
    expect(c.cases[0].status).toBe('pass');
    const p = await py(
      `import socket
s = socket.socket()
s.settimeout(2)
try:
    s.connect(("1.1.1.1", 53)); print("NET_OK")
except OSError:
    print("NO_NET")
`,
      one('NO_NET\n'),
    );
    expect(p.cases[0].status).toBe('pass');
  });

  it('T-ISO-2 — cấp phát vô hạn và fork bomb chạm trần của ĐÚNG ca đó; ca sau chạy bình thường', async () => {
    const r = await cpp(
      `#include <cstdio>
#include <cstring>
#include <string>
#include <unistd.h>
#include <vector>
int main() {
  char mode[16] = {0};
  if (std::scanf("%15s", mode) != 1) return 1;
  if (!std::strcmp(mode, "mem")) { std::vector<std::string> v; for (;;) v.emplace_back(1 << 24, 'x'); }
  if (!std::strcmp(mode, "fork")) { for (;;) fork(); }
  std::puts("ok");
}
`,
      [
        { name: 'mem', group: null, stdin: inline('mem\n'), expected: inline('ok\n') },
        { name: 'fork', group: null, stdin: inline('fork\n'), expected: inline('ok\n') },
        { name: 'ok', group: null, stdin: inline('ok\n'), expected: inline('ok\n') },
      ],
      { sanitize: false, limits: { memoryMb: 256, pids: 32, wallMsPerCase: 2_000 } },
    );
    expect(r.unavailable).toBeNull();
    expect(r.cases[0]).toMatchObject({ status: 'runtime_crash', limitsHit: ['memory'] });
    // Đo 2026-09-24: fork bomb với --pids-limit ra 124 (hết giờ), không phải sập.
    expect(r.cases[1].status).toBe('timeout');
    expect(r.cases[2].status).toBe('pass');
  });

  it('T-ISO-3 — ghi ra ngoài /tmp thất bại (hệ thống file chỉ đọc); /tmp ghi được', async () => {
    const r = await py(
      `import os
blocked = 0
for path in ["/work/x", "/x", "/etc/x", "/usr/x", "/home/x"]:
    try:
        open(path, "w").write("x")
    except OSError:
        blocked += 1
open("/tmp/x", "w").write("x")
print("RO_OK" if blocked == 5 and os.path.exists("/tmp/x") else "WRITE_LEAK")
`,
      one('RO_OK\n'),
    );
    expect(r.cases[0].status).toBe('pass');
  });

  it('T-ISO-6 — output mong đợi của ca khác và của chính ca này không có trong container', async () => {
    // Dấu hiệu KHÔNG xuất hiện nguyên văn trong mã bài: bài ghép nó lúc chạy.
    const id = randomUUID();
    const marker = `BI_MAT_${id}`;
    const search = `import os
m = "BI_" + "MAT_" + ${JSON.stringify(id)}
found = any(m in v for v in os.environ.values())
for root, dirs, files in os.walk("/"):
    if root.startswith(("/proc", "/sys", "/dev")):
        dirs[:] = []
        continue
    for f in files:
        p = os.path.join(root, f)
        try:
            if os.path.getsize(p) < 2_000_000 and m.encode() in open(p, "rb").read():
                found = True
        except OSError:
            pass
print("FOUND" if found else "NOT_FOUND")
`;
    // Duyệt cả hệ thống file của image mất vài giây — trần mặc định 2 giây không đủ.
    const r = await py(
      search,
      [
        { name: 'dich', group: null, stdin: inline(''), expected: inline(`${marker}\n`) },
        { name: 'do', group: null, stdin: inline(''), expected: null },
      ],
      { limits: { wallMsPerCase: 20_000 } },
    );
    expect(r.cases[1].status).toBe('ran');
    expect(r.cases[1].stdout).toBe('NOT_FOUND\n');
  });
});
