import { Channel, SandboxClient, WaitableJob } from './sandbox.client';

const inline = (content: string) => ({ kind: 'inline' as const, content });
const request = {
  language: 'cpp' as const,
  program: { files: [{ path: 'main.cpp', ref: inline('int main(){}') }], driver: null, entry: null },
  cases: [{ name: 'a', group: null, stdin: inline(''), expected: inline('') }],
};
const host = {
  hostname: 'h', cpuModel: 'c', cpuCount: 2, kernel: 'k', runtime: 'runc' as const,
  dockerVersion: '27', images: { cpp: 'sha256:a' }, workerVersion: 'v',
};
const resultFor = (jobId: string) => ({
  contract: 1, kind: 'exec', jobId, host, compile: { ok: true, log: '', ms: 1 },
  cases: [{ name: 'a', group: null, status: 'pass', ms: 5, stdout: null, diff: null, limitsHit: [] }],
  totalMs: 9, unavailable: null,
});

function channel(answer: (payload: { jobId: string }) => unknown | Promise<unknown>): Channel & { sent: { jobId: string }[]; removed: number } {
  const ch = {
    sent: [] as { jobId: string }[],
    removed: 0,
    events: {},
    queue: {
      add: async (_name: string, data: unknown): Promise<WaitableJob> => {
        const payload = data as { jobId: string };
        ch.sent.push(payload);
        return {
          waitUntilFinished: async () => answer(payload),
          remove: async () => {
            ch.removed++;
          },
        };
      },
    },
  };
  return ch;
}
const client = (exec: Channel, measure: Channel = channel(() => null), timeout = 1_000) =>
  new SandboxClient({ exec, measure, timeoutMs: { exec: timeout, measure: timeout } });

describe('SandboxClient', () => {
  it('kết quả đúng schema, đúng jobId → trả nguyên', async () => {
    const ch = channel((p) => resultFor(p.jobId));
    const r = await client(ch).exec(request);
    expect(r.unavailable).toBeNull();
    expect(r.jobId).toBe(ch.sent[0].jobId);
    expect(ch.sent[0]).toMatchObject({ contract: 1, kind: 'exec', sanitize: true });
  });

  it('T-ISO-4 — kết quả mang jobId của job KHÁC → unavailable, không trả kết quả đó', async () => {
    const r = await client(channel(() => resultFor('6f1c2a4e-9d7b-4c1a-8e3f-2b5d7a9c0e11'))).exec(request);
    expect(r.unavailable).toMatch(/không khớp jobId/);
    expect(r.cases).toEqual([]);
  });

  it('T-ISO-4 — kết quả sai schema → unavailable', async () => {
    const r = await client(channel((p) => ({ ...resultFor(p.jobId), cases: [{ status: 'hacked' }] }))).exec(request);
    expect(r.unavailable).toMatch(/sai schema/);
  });

  it('T-ISO-4 — kết quả thật mà thiếu dấu vân tay máy → unavailable', async () => {
    const r = await client(channel((p) => ({ ...resultFor(p.jobId), host: null }))).exec(request);
    expect(r.unavailable).toMatch(/sai schema/);
  });

  it('T-DOWN-1 — Redis không nhận job → unavailable, KHÔNG phải một ca fail', async () => {
    const down: Channel = { events: {}, queue: { add: async () => { throw new Error('connect ECONNREFUSED'); } } };
    const r = await client(down).exec(request);
    expect(r.unavailable).toMatch(/sandbox không trả lời: connect ECONNREFUSED/);
    expect(r.cases).toEqual([]);
  });

  it('T-DOWN-1 — worker không trả lời trong hạn → unavailable, và job bị gỡ khỏi hàng đợi', async () => {
    const ch = channel(() => new Promise(() => undefined));
    const r = await client(ch, undefined, 50).exec(request);
    expect(r.unavailable).toMatch(/sandbox không trả lời/);
    expect(ch.removed).toBe(1);
  });

  it('T-DOWN-1 — add treo (Redis mất kết nối giữa chừng) → vẫn unavailable đúng hạn', async () => {
    const hang: Channel = { events: {}, queue: { add: () => new Promise(() => undefined) } };
    const started = Date.now();
    const r = await client(hang, undefined, 50).exec(request);
    expect(r.unavailable).toMatch(/sandbox không trả lời/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('job do API dựng sai schema → ném NGAY, không gửi gì', async () => {
    const ch = channel((p) => resultFor(p.jobId));
    await expect(client(ch).exec({ ...request, language: 'java' as never })).rejects.toThrow();
    expect(ch.sent).toEqual([]);
  });

  it('measure đi hàng đợi measure, không đi hàng đợi exec', async () => {
    const exec = channel(() => null);
    const measure = channel((p) => ({
      contract: 1, kind: 'measure', jobId: p.jobId, host, slot: '2', timingMode: 'in_process',
      compile: null, baseline: [], samples: [], aborted: null,
      startedAt: '2026-09-24T00:00:00Z', finishedAt: '2026-09-24T00:00:01Z', unavailable: null,
    }));
    const r = await client(exec, measure).measure({
      language: 'cpp', timingMode: 'in_process',
      submission: { files: [{ path: 'main.cpp', ref: inline('') }], driver: inline(''), entry: null },
      reference: null, points: [{ n: 1, stdin: inline('1\n') }],
    });
    expect(r.unavailable).toBeNull();
    expect(exec.sent).toEqual([]);
    expect(measure.sent).toHaveLength(1);
  });
});
