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

function channel(
  answer: (payload: { jobId: string }) => unknown | Promise<unknown>,
  opts: { removeHangs?: boolean } = {},
): Channel & { sent: { jobId: string }[]; removed: number; ttls: (number | undefined)[] } {
  const ch = {
    sent: [] as { jobId: string }[],
    removed: 0,
    ttls: [] as (number | undefined)[],
    events: {},
    queue: {
      add: async (_name: string, data: unknown): Promise<WaitableJob> => {
        const payload = data as { jobId: string };
        ch.sent.push(payload);
        return {
          waitUntilFinished: async (_events: unknown, ttl?: number) => {
            ch.ttls.push(ttl);
            return answer(payload);
          },
          remove: async () => {
            ch.removed++;
            if (opts.removeHangs) await new Promise(() => undefined);
          },
        };
      },
    },
  };
  return ch;
}
const client = (exec: Channel, measure: Channel = channel(() => null), queueWait = 1_000) =>
  new SandboxClient({ exec, measure, queueWaitMs: { exec: queueWait, measure: queueWait } });
/** Ngân sách nhỏ nhất hợp đồng cho — để các test hết hạn chạy nhanh. */
const quick = { ...request, budgetMs: 1_000 };

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
    const r = await client(ch, undefined, 50).exec(quick);
    expect(r.unavailable).toMatch(/sandbox không trả lời/);
    expect(ch.removed).toBe(1);
  });

  it('review I3 — hạn chờ = ngân sách của job + thời gian xếp hàng, không phải một hằng số', async () => {
    const ch = channel((p) => resultFor(p.jobId));
    await client(ch, undefined, 7_000).exec({ ...request, budgetMs: 5_000 });
    expect(ch.ttls).toEqual([12_000]);
  });

  it('review M6 — gỡ job treo (Redis mất) vẫn không giữ lời gọi quá hạn', async () => {
    const ch = channel(() => new Promise(() => undefined), { removeHangs: true });
    const started = Date.now();
    const r = await client(ch, undefined, 50).exec(quick);
    expect(r.unavailable).toMatch(/sandbox không trả lời/);
    expect(Date.now() - started).toBeLessThan(4_500);
  });

  it('review M13 — request không đè được jobId, contract hay kind', async () => {
    const ch = channel((p) => resultFor(p.jobId));
    const evil = { ...request, jobId: '6f1c2a4e-9d7b-4c1a-8e3f-2b5d7a9c0e11', kind: 'measure' } as typeof request;
    const r = await client(ch).exec(evil);
    expect(ch.sent[0].jobId).not.toBe('6f1c2a4e-9d7b-4c1a-8e3f-2b5d7a9c0e11');
    expect(ch.sent[0]).toMatchObject({ kind: 'exec' });
    expect(r.unavailable).toBeNull();
  });

  it('T-DOWN-1 — add treo (Redis mất kết nối giữa chừng) → vẫn unavailable đúng hạn', async () => {
    const hang: Channel = { events: {}, queue: { add: () => new Promise(() => undefined) } };
    const started = Date.now();
    const r = await client(hang, undefined, 50).exec(quick);
    expect(r.unavailable).toMatch(/sandbox không trả lời/);
    expect(Date.now() - started).toBeLessThan(3_000);
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
