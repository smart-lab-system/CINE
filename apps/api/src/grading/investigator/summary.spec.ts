import { renderSummary } from './summary';
import { CTX } from './testing/context';
import { StructuredResult, ToolCall } from './types';

const tc = (id: string, tool: ToolCall['tool'], over: Partial<ToolCall> = {}): ToolCall => ({
  id,
  tool,
  args: tool === 'run_tests' ? { group: null } : {},
  status: 'ok',
  output: '',
  structuredRef: tool === 'run_tests' ? id : null,
  startedAt: '2026-09-24T00:00:00.000Z',
  wallMs: 1,
  injectionSuspected: false,
  ...over,
});
const tests: StructuredResult = {
  kind: 'run_tests',
  compile: { ok: true, log: '', ms: 1 },
  aborted: false,
  host: null,
  cases: [
    { name: 'cb1', group: 'co_ban', status: 'pass', diff: null, ms: 1 },
    { name: 'tl1', group: 'trung_lap', status: 'fail', diff: 'x', ms: 1 },
    { name: 'tl2', group: 'trung_lap', status: 'fail', diff: 'x', ms: 1 },
  ],
};

describe('renderSummary — §5.1', () => {
  it('T-AG-8 — đếm từ toolCalls THẬT; văn bản model (note) KHÔNG đi thẳng ra', () => {
    const text = renderSummary({
      toolCalls: [tc('tc-1', 'read_file'), tc('tc-2', 'run_tests')],
      structured: { 'tc-2': tests },
      verdict: {
        errors: [{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-2'], note: 'MODEL: đã chạy 13 test và thêm 11 khoá' }],
        missingRules: [{ description: 'MODEL: luật bịa', toolCallIds: [] }],
        injectionAttempt: { detected: false, excerpt: null },
      },
      rules: CTX.rules,
      stopReason: 'verdict',
    });
    expect(text).toMatch(/Đã gọi 2 công cụ \(1 read_file, 1 run_tests\)/);
    expect(text).toMatch(/tc-2 run_tests \(mọi nhóm\): 1\/3 ca đạt — trượt: trung_lap 0\/2/);
    expect(text).toMatch(/sai_ca_co_ban — Sai ca cơ bản \(bằng chứng: tc-2\)/);
    expect(text).toMatch(/Luật còn thiếu do agent báo: 1/);
    expect(text).not.toMatch(/MODEL:/);
  });

  it('không có kết luận và lời gọi hỏng được nói ra', () => {
    const text = renderSummary({
      toolCalls: [tc('tc-1', 'run', { status: 'unavailable' })],
      structured: {},
      verdict: null,
      rules: [],
      stopReason: 'stalled',
    });
    expect(text).toMatch(/tc-1 run: unavailable/);
    expect(text).toMatch(/Không có kết luận/);
    expect(text).toMatch(/agent treo/);
  });
});
