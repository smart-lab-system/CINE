import { OmissionLens } from './omission-lens';
import { ModelTier } from '../model-pool';
import { ChatTextRequest } from '../../ai-provider/openai-chat';
import { execResult, fakeSandbox } from '../testing/fake-sandbox';
import { CTX } from '../testing/context';
import { Verdict } from '../types';

const USAGE = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 };
const VERDICT: Verdict = { errors: [], missingRules: [], injectionAttempt: { detected: false, excerpt: null } };
const withErrors = (...keys: string[]): Verdict => ({ ...VERDICT, errors: keys.map((ruleKey) => ({ ruleKey, toolCallIds: [], note: null })) });
// CTX.rules: sai_ca_co_ban = luật MÁY (nhóm test co_ban), chu_thich_sai = luật MODEL.
const CALL = JSON.stringify({ action: 'call', calls: [{ tool: 'read_file', path: 'bai-nop/main.cpp' }], conclusion: null });
const checklist = (rules: { ruleKey: string; verdict: string }[], note: string) =>
  JSON.stringify({ action: 'final', calls: [], conclusion: { rules, note } });

function scripted(script: string[], onCall?: (req: ChatTextRequest) => void): ModelTier {
  let i = 0;
  return {
    label: 'A', model: 'A-m', ceiling: 0.5,
    async call(req) { onCall?.(req); const c = script[Math.min(i, script.length - 1)]; i++; return { content: c, usage: USAGE }; },
  };
}
const passAll = () => fakeSandbox((req) => execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'pass' }))));

describe('OmissionLens — bảng kiểm từng luật bằng lời chưa được kết luận', () => {
  it('diễn tập r3 (HS2410018) — agent chỉ kết luận lỗi máy, bỏ sót luật bằng lời; bảng kiểm đánh "violated" → suspected true', async () => {
    const lens = new OmissionLens({ models: [scripted([CALL, checklist([{ ruleKey: 'chu_thich_sai', verdict: 'violated' }], 'chú thích dòng 3 sai')])], sandbox: passAll() });
    const r = await lens.review(CTX, withErrors('sai_ca_co_ban'), []);
    expect(r.suspected).toBe(true);
    expect(r.note).toContain('chu_thich_sai');
  });

  it('bảng kiểm "ok" hay "unsure" → không nghi', async () => {
    for (const verdict of ['ok', 'unsure']) {
      const lens = new OmissionLens({ models: [scripted([CALL, checklist([{ ruleKey: 'chu_thich_sai', verdict }], 'x')])], sandbox: passAll() });
      expect((await lens.review(CTX, VERDICT, [])).suspected).toBe(false);
    }
  });

  it('"violated" cho luật MÁY KIỂM hay luật không có trong bảng → bỏ qua', async () => {
    const lens = new OmissionLens({
      models: [scripted([CALL, checklist([{ ruleKey: 'sai_ca_co_ban', verdict: 'violated' }, { ruleKey: 'khong_ton_tai', verdict: 'violated' }], 'x')])],
      sandbox: passAll(),
    });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
    expect(r.note).not.toContain('không kết luận được');
  });

  it('mọi luật bằng lời đã được kết luận → KHÔNG gọi model (không còn gì để bỏ sót), suspected false', async () => {
    let calls = 0;
    const lens = new OmissionLens({ models: [scripted([checklist([], 'x')], () => calls++)], sandbox: passAll() });
    const r = await lens.review(CTX, withErrors('chu_thich_sai'), []);
    expect(calls).toBe(0);
    expect(r.suspected).toBe(false);
  });

  it('model không xét hết bảng kiểm → ghi chú nêu luật CHƯA XÉT (không lặng lẽ coi là "ok")', async () => {
    const lens = new OmissionLens({ models: [scripted([CALL, checklist([], 'đã đọc bài')])], sandbox: passAll() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
    expect(r.note).toContain('chưa xét: chu_thich_sai');
  });

  it('khuôn cũ "missedRuleKeys" vẫn được đọc (model quen tay) — luật bằng lời chưa kết luận vẫn nghi', async () => {
    const legacy = JSON.stringify({ action: 'final', calls: [], conclusion: { missedRuleKeys: ['chu_thich_sai'], note: 'x' } });
    const lens = new OmissionLens({ models: [scripted([CALL, legacy])], sandbox: passAll() });
    expect((await lens.review(CTX, VERDICT, [])).suspected).toBe(true);
  });

  it('tin nhắn liệt kê TỪNG luật bằng lời chưa kết luận (kèm tên), tách khỏi luật máy tự áp; prompt đòi "rules"', async () => {
    const seen: ChatTextRequest[] = [];
    const lens = new OmissionLens({ models: [scripted([checklist([], 'ok')], (req) => seen.push(req))], sandbox: passAll() });
    await lens.review(CTX, VERDICT, []);
    const user = seen[0].messages[0].content;
    expect(user).toMatch(/CHƯA được kết luận[^\n]*chu_thich_sai \(Chú thích sai\)/);
    expect(user).toMatch(/máy kiểm[^\n]*sai_ca_co_ban/i);
    expect(seen[0].system).toContain('"rules"');
  });

  it('W4 — "violated" nhưng KHÔNG hề gọi công cụ nào → hạ về false, ghi "(chưa tự kiểm được)"', async () => {
    const lens = new OmissionLens({ models: [scripted([checklist([{ ruleKey: 'chu_thich_sai', verdict: 'violated' }], 'có thể thiếu')])], sandbox: passAll() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
    expect(r.note).toContain('chưa tự kiểm được');
  });

  it('kết luận hợp lệ nhưng note dài 800 ký tự → giữ kết luận, note ≤ 500', async () => {
    const lens = new OmissionLens({ models: [scripted([CALL, checklist([{ ruleKey: 'chu_thich_sai', verdict: 'violated' }], `sai. ${'chi tiết '.repeat(90)}`)])], sandbox: passAll() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(true);
    expect(r.note.length).toBeLessThanOrEqual(500);
  });

  it('không kết luận được → ghi chú NÊU LÝ DO thật của bậc model', async () => {
    const lens = new OmissionLens({ models: [scripted(['không phải JSON'])], sandbox: passAll() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
    expect(r.note).toContain('không kết luận được');
    expect(r.note).toContain('bad_output');
  });

  it('prompt nói rõ giới hạn 500 ký tự của note', async () => {
    const seen: ChatTextRequest[] = [];
    await new OmissionLens({ models: [scripted([checklist([], 'ok')], (req) => seen.push(req))], sandbox: passAll() }).review(CTX, VERDICT, []);
    expect(seen[0].system).toContain('500 ký tự');
  });
});
