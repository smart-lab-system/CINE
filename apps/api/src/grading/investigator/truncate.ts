/** §5.3: mỗi `toolCall.output` tối đa 8 KB. */
export const TOOL_OUTPUT_MAX_BYTES = 8 * 1024;
/** Chỗ dành cho dấu đã cắt — "\n…[đã cắt 12345678 byte]…\n" dài dưới 40 byte. */
const MARKER_RESERVE = 80;

/** Lùi về đầu ký tự: byte dạng 10xxxxxx là byte tiếp nối của một ký tự UTF-8. */
function backToCharStart(buf: Buffer, i: number): number {
  while (i > 0 && i < buf.length && (buf[i] & 0xc0) === 0x80) i--;
  return i;
}

function forwardToCharStart(buf: Buffer, i: number): number {
  while (i < buf.length && (buf[i] & 0xc0) === 0x80) i++;
  return i;
}

/**
 * Cắt LÚC GHI (§5.3): cột `investigation` không sửa lại được sau khi ghi, nên cắt sau là
 * không bao giờ. Giữ phần đầu (lỗi biên dịch) và phần cuối (stack trace) — cắt giữa là
 * chỗ mất ít thông tin nhất — và nói rõ đã bỏ bao nhiêu byte.
 */
export function truncateOutput(text: string, maxBytes = TOOL_OUTPUT_MAX_BYTES): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return text;
  const keep = Math.max(0, maxBytes - MARKER_RESERVE);
  const headEnd = backToCharStart(buf, Math.floor(keep / 2));
  const tailStart = forwardToCharStart(buf, buf.length - (keep - headEnd));
  const dropped = tailStart - headEnd;
  return (
    buf.subarray(0, headEnd).toString('utf8') +
    `\n…[đã cắt ${dropped} byte]…\n` +
    buf.subarray(tailStart).toString('utf8')
  );
}
