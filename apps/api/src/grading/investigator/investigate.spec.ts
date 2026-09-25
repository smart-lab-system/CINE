import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExecRequest } from '../../sandbox/sandbox.client';
import { ChatTextRequest } from '../ai-provider/openai-chat';
import { httpProviderError } from '../ai-provider/provider-failure';
import { ALL_COMPONENTS, investigate } from './investigate';
import { ModelTier } from './model-pool';
import { execResult, fakeSandbox } from './testing/fake-sandbox';
import { CTX } from './testing/context';

const USAGE = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 };
const call = (tool: string, extra: Record<string, unknown> = {}) => ({ tool, input: null, group: null, path: null, fromLine: null, toLine: null, ...extra });
const turn = (...calls: object[]) => JSON.stringify({ action: 'call', calls, verdict: null });
const final = (errors: object[] = [], injection = false) =>
  JSON.stringify({ action: 'final', calls: [], verdict: { errors, missingRules: [], injectionAttempt: { detected: injection, excerpt: null } } });

function scripted(label: string, script: (string | Error)[], onCall?: (req: ChatTextRequest) => void): ModelTier & { requests: ChatTextRequest[] } {
  const requests: ChatTextRequest[] = [];
  return {
    label, model: `${label}-m`, requests,
    async call(req) {
      requests.push(req);
      onCall?.(req);
      const next = script[Math.min(requests.length - 1, script.length - 1)];
      if (next instanceof Error) throw next;
      return { content: next, usage: USAGE };
    },
  };
}
/** Mọi ca có output mong đợi đều đạt; lời gọi `run` in "6". Trả đúng tên ca được hỏi — sàn đếm theo tên. */
const passAllResult = (req: ExecRequest) =>
  execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: c.expected ? 'pass' : 'ran', stdout: c.expected ? null : '6\n' })));
const passAll = () => fakeSandbox(passAllResult);
const deps = (models: ModelTier[], sandbox = passAll(), extra = {}) => ({ models, sandbox, sleep: async () => undefined, random: () => 0, ...extra });

describe('investigate()', () => {
  it('đường chuẩn: gọi run_tests, kết luận có bằng chứng → verdict, tóm tắt do harness render', async () => {
    const model = scripted('A', [turn(call('run_tests')), final([{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'], note: null }])]);
    const r = await investigate(CTX, deps([model]));
    expect(r.kind).toBe('verdict');
    expect(r.verdict?.errors.map((e) => e.ruleKey)).toEqual(['sai_ca_co_ban']);
    expect(r.investigation.budget).toMatchObject({ toolCalls: 1, rounds: 2, stopReason: 'verdict' });
    expect(r.investigation.modelsUsed).toEqual(['A-m']);
    expect(r.summary).toMatch(/Đã gọi 1 công cụ/);
  });

  it('T-AG-1 — chạm trần lời gọi (đã qua sàn) → xin MỘT kết luận từ dữ liệu đã có, không ném', async () => {
    const ctx = { ...CTX, budget: { ...CTX.budget, maxToolCalls: 2 } };
    const model = scripted('A', [
      turn(call('run_tests'), call('run', { input: '1\n' }), call('run', { input: '2\n' })),
      final([{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'], note: null }]),
    ]);
    const r = await investigate(ctx, deps([model]));
    expect(r.kind).toBe('verdict');
    expect(r.investigation.toolCalls).toHaveLength(2);
    expect(r.investigation.budget).toMatchObject({ stopReason: 'max_tool_calls', forcedFinal: true });
    expect(r.flags).toContain('budget_exhausted');
    expect(model.requests[1].messages.at(-1)!.content).toMatch(/Đã hết ngân sách công cụ/);
  });

  it('T-AG-2 + Review Focus 4 — lỗi trích mã bịa, lời gọi bị chặn, hay luật lạ đều bị loại, có lý do', async () => {
    const model = scripted('A', [
      turn(call('run_tests'), call('list_files'), call('list_files'), call('list_files')), // tc-4 bị chặn (hạn 2)
      final([
        { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'], note: null },
        { ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-99'], note: null },
        { ruleKey: 'chu_thich_sai', toolCallIds: ['tc-4'], note: null },
        { ruleKey: 'luat_bia', toolCallIds: ['tc-1'], note: null },
      ]),
    ]);
    const r = await investigate(CTX, deps([model]), { ...ALL_COMPONENTS, replayCheck: false });
    expect(r.verdict?.errors).toEqual([{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'], note: null }]);
    expect(r.rejected).toEqual([
      { ruleKey: 'sai_ca_co_ban', reason: 'fabricated_tool_call' },
      { ruleKey: 'chu_thich_sai', reason: 'no_valid_tool_call' },
      { ruleKey: 'luat_bia', reason: 'unknown_rule' },
    ]);
  });

  it('T-AG-3 — chạy lại một lời gọi, lệch kết quả → gắn cờ và hạ trần confidence', async () => {
    let n = 0;
    const flaky = fakeSandbox((req) =>
      req.cases[0].expected === null ? execResult([{ name: 'run', status: 'ran', stdout: ++n === 1 ? 'A' : 'B' }]) : passAllResult(req),
    );
    const model = scripted('A', [
      turn(call('run_tests'), call('run', { input: '1\n' })),
      final([{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-2'], note: null }]),
    ]);
    const r = await investigate(CTX, deps([model], flaky));
    expect(r.replay).toEqual({ toolCallId: 'tc-2', matched: false });
    expect(r.flags).toContain('replay_mismatch');
    expect(r.confidenceCap).toBe(0.5);
  });

  it('T-AG-3 — chạy lại khớp → không cờ, trần 1; tắt bằng cấu hình → không chạy lại', async () => {
    const model = () =>
      scripted('A', [
        turn(call('run_tests'), call('run', { input: '1\n' })),
        final([{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-2'], note: null }]),
      ]);
    const on = await investigate(CTX, deps([model()], passAll()));
    expect(on.replay).toEqual({ toolCallId: 'tc-2', matched: true });
    expect(on.confidenceCap).toBe(1);
    const off = passAll();
    const r = await investigate(CTX, deps([model()], off), { ...ALL_COMPONENTS, replayCheck: false });
    expect(r.replay).toBeNull();
    expect(off.requests).toHaveLength(2); // run_tests + run, không có lượt chạy lại
  });

  it('T-AG-5 — bị chặn trùng 3 lần liên tiếp → huỷ vòng lặp', async () => {
    const same = call('read_file', { path: 'bai-nop/main.cpp' });
    const model = scripted('A', [turn(same, same, same, same, same), turn(same, same)]);
    const r = await investigate(CTX, deps([model]));
    expect(r.investigation.budget.stopReason).toBe('blocked_repeatedly');
    expect(r.investigation.toolCalls.filter((t) => t.status === 'blocked_duplicate')).toHaveLength(3);
  });

  it('T-AG-6 — 2 vòng, 0 lời gọi thành công, quá 60 s → ngắt sớm, ungradable lớp system, KHÔNG phải một con số', async () => {
    let t = 0;
    const model = scripted('A', [turn(call('run', { input: '1\n' }))], () => (t += 40_000));
    const r = await investigate(
      CTX,
      deps([model], passAll(), { now: () => t }),
      { replayCheck: true, tools: { ...ALL_COMPONENTS.tools, run: false } },
    );
    expect(r.investigation.budget.stopReason).toBe('stalled');
    expect(r.kind).toBe('ungradable');
    expect(r.ungradable).toEqual({ class: 'system', reason: expect.stringMatching(/treo/) });
    expect(r.verdict).toBeNull();
  });

  it('T-AG-7 — bậc chết giữa vòng → xoay bậc, GIỮ lịch sử toolCalls, lượt xoay không tiêu một vòng', async () => {
    const a = scripted('A', [turn(call('list_files')), httpProviderError(403, undefined, 'hết tiền')]);
    const b = scripted('B', [turn(call('run_tests')), final([{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-2'], note: null }])]);
    const r = await investigate(CTX, deps([a, b]));
    expect(r.investigation.toolCalls.map((t) => t.tool)).toEqual(['list_files', 'run_tests']);
    expect(r.investigation.budget.rounds).toBe(3);
    expect(r.investigation.tierRotations).toEqual([{ round: 2, from: 'A', reason: expect.stringMatching(/tier_dead/) }]);
    expect(r.investigation.modelsUsed).toEqual(['A-m', 'B-m']);
    expect(b.requests[0].messages.map((m) => m.content).join('\n')).toContain('[tc-1] list_files');
  });

  it('mọi bậc hỏng trước lời gọi nào → ungradable lớp system', async () => {
    const r = await investigate(CTX, deps([scripted('A', [httpProviderError(401, undefined, 'x')])]));
    expect(r.kind).toBe('ungradable');
    expect(r.investigation.budget.stopReason).toBe('models_exhausted');
  });

  it('kết luận ngay mà chưa gọi công cụ nào → ungradable (0 lời gọi thành công là sàn §4.4)', async () => {
    const r = await investigate(CTX, deps([scripted('A', [final([])])]));
    expect(r.kind).toBe('ungradable');
  });

  it('review I2 — gói test RỖNG: list_files rồi kết luận "không lỗi" → ungradable, không phải điểm tối đa', async () => {
    const empty = { ...CTX, testBundle: { id: 'rong@0', cases: [] } };
    const model = scripted('A', [turn(call('list_files')), final([])]);
    const r = await investigate(empty, deps([model]));
    expect(r.kind).toBe('ungradable');
    expect(r.ungradable).toEqual({ class: 'system', reason: expect.stringMatching(/gói test rỗng/) });
  });

  it('T-FLOOR-3 — chỉ list_files / read_file rồi kết luận "không lỗi" → ungradable, KHÔNG phải điểm tối đa', async () => {
    const model = scripted('A', [turn(call('list_files'), call('read_file', { path: 'bai-nop/main.cpp' })), final([])]);
    const r = await investigate(CTX, deps([model]));
    expect(r.kind).toBe('ungradable');
    expect(r.verdict).toBeNull();
    expect(r.ungradable).toEqual({ class: 'system', reason: expect.stringMatching(/gói test chưa chạy đủ/) });
  });

  it('T-FLOOR-3 — chỉ chạy một nhóm → gói test chưa chạy đủ → ungradable, nêu đích danh nhóm còn thiếu', async () => {
    const model = scripted('A', [turn(call('run_tests', { group: 'co_ban' })), final([])]);
    const r = await investigate(CTX, deps([model]));
    expect(r.kind).toBe('ungradable');
    expect(r.ungradable?.reason).toMatch(/trung_lap/);
    expect(r.ungradable?.reason).not.toMatch(/co_ban/);
  });

  it('T-FLOOR-2 phía vòng lặp — chạy từng nhóm cho tới đủ, không lỗi → verdict; điểm tối đa là hợp lệ', async () => {
    const model = scripted('A', [turn(call('run_tests', { group: 'co_ban' }), call('run_tests', { group: 'trung_lap' })), final([])]);
    const r = await investigate(CTX, deps([model]));
    expect(r.kind).toBe('verdict');
    expect(r.verdict?.errors).toEqual([]);
  });

  it('bài không biên dịch: run_tests toàn gói ra lỗi biên dịch → thước ĐÃ đo, không phải "chưa chạy"', async () => {
    const broken = fakeSandbox(() => execResult([], { compile: { ok: false, log: 'main.cpp:1: lỗi', ms: 1 } }));
    const model = scripted('A', [turn(call('run_tests')), final([])]);
    const r = await investigate(CTX, deps([model], broken));
    expect(r.kind).toBe('verdict');
  });

  it('gói test dừng giữa chừng (aborted) → chỉ phần đã có kết quả mới tính là đã chạy', async () => {
    const cut = fakeSandbox((req) =>
      execResult([{ name: req.cases[0].name, group: req.cases[0].group, status: 'pass' }], { aborted: 'budget' }),
    );
    const model = scripted('A', [turn(call('run_tests')), final([])]);
    const r = await investigate(CTX, deps([model], cut));
    expect(r.kind).toBe('ungradable');
  });

  it('§7.2 đo SỰ SỐNG, sàn đo BẰNG CHỨNG: 2 vòng chỉ đọc file với model chậm (> 60 s) → KHÔNG bị ngắt là treo', async () => {
    let t = 0;
    const model = scripted(
      'A',
      [turn(call('list_files')), turn(call('read_file', { path: 'bai-nop/main.cpp' })), turn(call('run_tests')), final([])],
      () => (t += 35_000),
    );
    const r = await investigate(CTX, deps([model], passAll(), { now: () => t }));
    expect(r.investigation.budget.stopReason).toBe('verdict');
    expect(r.kind).toBe('verdict');
  });

  it('Review Focus 5 — timeout của lời gọi model không vượt phần thời gian còn lại', async () => {
    // Lần đọc đồng hồ đầu tiên là lúc bắt đầu (0); mọi lần sau là giây 280 của trần 300.
    let reads = 0;
    const now = () => (reads++ === 0 ? 0 : 280_000);
    const model = scripted('A', [final([])]);
    await investigate(CTX, deps([model], passAll(), { now }));
    expect(model.requests[0].timeoutMs).toBeLessThanOrEqual(20_000);
  });

  it('model đòi quá 5 lời gọi một lượt → chạy 5, và lượt sau model được báo phần bị bỏ', async () => {
    const seven = Array.from({ length: 7 }, (_, i) => call('run', { input: `${i}\n` }));
    const model = scripted('A', [turn(...seven), final([])]);
    const r = await investigate(CTX, deps([model]), { ...ALL_COMPONENTS, replayCheck: false });
    expect(r.investigation.toolCalls).toHaveLength(5);
    expect(model.requests[1].messages.at(-1)!.content).toMatch(/2 lời gọi vượt trần 5/);
  });

  it('injection model báo → cờ injection_suspected; KHÔNG thêm lỗi nào (§3.3 luật 4)', async () => {
    const model = scripted('A', [turn(call('run_tests')), final([], true)]);
    const r = await investigate(CTX, deps([model]));
    expect(r.flags).toContain('injection_suspected');
    expect(r.verdict?.errors).toEqual([]);
  });

  it('§12.5 yêu cầu 2 — investigate() KHÔNG tự gọi phản biện', () => {
    const src = readFileSync(join(__dirname, 'investigate.ts'), 'utf8');
    expect(src).not.toMatch(/challenge/i);
  });
});
