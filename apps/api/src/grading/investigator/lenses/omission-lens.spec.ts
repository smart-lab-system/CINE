import { OmissionLens } from './omission-lens';
import { ModelTier } from '../model-pool';
import { ChatTextRequest } from '../../ai-provider/openai-chat';
import { execResult, fakeSandbox } from '../testing/fake-sandbox';
import { CTX } from '../testing/context';
import { Verdict } from '../types';

const USAGE = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 };
const VERDICT: Verdict = { errors: [], missingRules: [], injectionAttempt: { detected: false, excerpt: null } };
// CTX.rules: sai_ca_co_ban = luật MÁY (nhóm test co_ban), chu_thich_sai = luật MODEL.
const CALL = JSON.stringify({ action: 'call', calls: [{ tool: 'run_tests' }], conclusion: null });
const final = (missedRuleKeys: string[], note: string) =>
  JSON.stringify({ action: 'final', calls: [], conclusion: { missedRuleKeys, note } });

function scripted(script: string[], onCall?: (req: ChatTextRequest) => void): ModelTier {
  let i = 0;
  return {
    label: 'A', model: 'A-m', ceiling: 0.5,
    async call(req) { onCall?.(req); const c = script[Math.min(i, script.length - 1)]; i++; return { content: c, usage: USAGE }; },
  };
}
const passAll = () => fakeSandbox((req) => execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: 'pass' }))));

describe('OmissionLens', () => {
  it('luật MODEL bài vi phạm mà agent chưa kết luận, CÓ tự dò bằng công cụ → suspected true, ghi chú nêu tên luật', async () => {
    const lens = new OmissionLens({ models: [scripted([CALL, final(['chu_thich_sai'], 'chú thích dòng 3 mô tả sai thuật toán')])], sandbox: passAll() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(true);
    expect(r.note).toContain('chu_thich_sai');
    expect(r.note).toContain('chú thích dòng 3 mô tả sai thuật toán');
  });

  it('diễn tập 2026-09-28 (HS2410020) — "bỏ sót" một luật MÁY KIỂM → không tính: hệ thống tự áp từ run_tests', async () => {
    const lens = new OmissionLens({ models: [scripted([CALL, final(['sai_ca_co_ban'], 'agent chấm bỏ sót sai_ca_co_ban')])], sandbox: passAll() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
    expect(r.note).not.toContain('không kết luận được');
  });

  it('diễn tập 2026-09-28 (HS2410022) — "bỏ sót" một luật agent ĐÃ kết luận → không tính', async () => {
    const concluded: Verdict = { ...VERDICT, errors: [{ ruleKey: 'chu_thich_sai', toolCallIds: [], note: null }] };
    const lens = new OmissionLens({ models: [scripted([CALL, final(['chu_thich_sai'], 'không thấy lỗi mới ngoài lỗi đã kết luận')])], sandbox: passAll() });
    const r = await lens.review(CTX, concluded, []);
    expect(r.suspected).toBe(false);
    expect(r.note).not.toContain('không kết luận được');
  });

  it('rule_key không có trong bảng lỗi → không tính (vấn đề ngoài bảng chỉ nằm trong note)', async () => {
    const lens = new OmissionLens({ models: [scripted([CALL, final(['khong_dung_linked_list'], 'không dùng danh sách liên kết')])], sandbox: passAll() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
    expect(r.note).toContain('không dùng danh sách liên kết');
  });

  it('model vẫn trả khuôn cũ {suspected:true} không có missedRuleKeys → đọc được, suspected false (không tin cờ tự khai)', async () => {
    const old = JSON.stringify({ action: 'final', calls: [], conclusion: { suspected: true, note: 'có thể còn thiếu' } });
    const lens = new OmissionLens({ models: [scripted([CALL, old])], sandbox: passAll() });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
    expect(r.note).toBe('có thể còn thiếu');
  });

  it('W4 — bỏ sót thật nhưng KHÔNG hề gọi công cụ nào → hạ về false, không được tin suông', async () => {
    const lens = new OmissionLens({ models: [scripted([final(['chu_thich_sai'], 'có thể còn thiếu')])], sandbox: fakeSandbox(() => execResult([])) });
    const r = await lens.review(CTX, VERDICT, []);
    expect(r.suspected).toBe(false);
    expect(r.note).toContain('chưa tự kiểm được');
  });

  it('tin nhắn cho model tách rõ lỗi đã kết luận với luật MÁY KIỂM tự áp (không bao giờ tính là bỏ sót)', async () => {
    const seen: ChatTextRequest[] = [];
    const lens = new OmissionLens({ models: [scripted([final([], 'ok')], (req) => seen.push(req))], sandbox: passAll() });
    await lens.review(CTX, { ...VERDICT, errors: [{ ruleKey: 'chu_thich_sai', toolCallIds: [], note: null }] }, []);
    const user = seen[0].messages[0].content;
    expect(user).toContain('chu_thich_sai');
    expect(user).toMatch(/máy kiểm[^\n]*sai_ca_co_ban/i);
    expect(seen[0].system).toContain('missedRuleKeys');
  });

  it('kết luận hợp lệ nhưng note dài 800 ký tự → giữ kết luận, note ≤ 500', async () => {
    const lens = new OmissionLens({ models: [scripted([CALL, final(['chu_thich_sai'], `chú thích sai. ${'chi tiết '.repeat(90)}`)])], sandbox: passAll() });
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
    await new OmissionLens({ models: [scripted([final([], 'ok')], (req) => seen.push(req))], sandbox: passAll() }).review(CTX, VERDICT, []);
    expect(seen[0].system).toContain('500 ký tự');
  });
});
