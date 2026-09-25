import { TOOL_OUTPUT_MAX_BYTES, truncateOutput } from './truncate';

const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

describe('truncateOutput — §5.3', () => {
  it('≤ 8 KB → giữ nguyên từng byte', () => {
    const s = 'x'.repeat(TOOL_OUTPUT_MAX_BYTES);
    expect(truncateOutput(s)).toBe(s);
  });

  it('T-SIZE-1 — vượt 8 KB → cắt lúc ghi, giữ ĐẦU và CUỐI, ghi đúng số byte đã bỏ', () => {
    const s = `LỖI BIÊN DỊCH Ở ĐẦU\n${'y'.repeat(20_000)}\nSTACK TRACE Ở CUỐI`;
    const out = truncateOutput(s);
    expect(bytes(out)).toBeLessThanOrEqual(TOOL_OUTPUT_MAX_BYTES);
    expect(out.startsWith('LỖI BIÊN DỊCH Ở ĐẦU')).toBe(true);
    expect(out.endsWith('STACK TRACE Ở CUỐI')).toBe(true);
    const dropped = Number(/đã cắt (\d+) byte/.exec(out)![1]);
    const [head, tail] = out.split(/\n…\[đã cắt \d+ byte\]…\n/);
    expect(bytes(head) + dropped + bytes(tail)).toBe(bytes(s));
  });

  it('không bao giờ cắt giữa một ký tự nhiều byte', () => {
    const out = truncateOutput('đ'.repeat(6_000)); // 12 000 byte
    expect(out).not.toContain('�');
    expect(bytes(out)).toBeLessThanOrEqual(TOOL_OUTPUT_MAX_BYTES);
  });

  it('trần tuỳ chọn — dùng cho phần model được xem (2 KB)', () => {
    expect(bytes(truncateOutput('z'.repeat(10_000), 2_048))).toBeLessThanOrEqual(2_048);
  });
});
