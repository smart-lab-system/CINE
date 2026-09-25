import { StructuredResult, ToolCall } from './types';

// Thuần, dùng chung cho investigate() (sàn của cuộc điều tra) và decide() (sàn của quyết định —
// review I2: decide() được gọi lại trên hồ sơ đã lưu, không được dựa vào việc investigate() đã chặn).
/**
 * Sàn T-FLOOR-3 (§4.4 dòng đầu): mọi ca của gói test phải có kết quả trong ít nhất một lời gọi
 * `run_tests` thành công. "Chạy ĐỦ", không phải "có chạy": T-FLOOR-2 chỉ cho điểm tối đa khi bài
 * "đã chạy đủ test và đều pass", và một lần `list_files` — hay một nhóm test — không phải thước.
 * Lời gọi mà bài không biên dịch được tính là đã chạy mọi ca nó yêu cầu: thước đã đo, kết quả
 * là "không chạy được". Lời gọi bị dừng giữa chừng chỉ tính các ca đã có kết quả.
 *
 * Tách khỏi luật treo §7.2 có chủ đích: luật treo đo SỰ SỐNG của agent và đếm mọi lời gọi thành
 * công — đếm riêng lời gọi sandbox ở đó sẽ ngắt oan một model chậm đang đọc file hai vòng đầu.
 */
export function uncoveredCases<C extends { name: string; group: string }>(
  cases: C[],
  toolCalls: ToolCall[],
  structured: Record<string, StructuredResult>,
): C[] {
  // Theo (nhóm, tên), không theo tên: hai ca trùng tên ở hai nhóm không được che nhau (review M5).
  const key = (c: { group: string | null; name: string }) => JSON.stringify([c.group, c.name]);
  const covered = new Set<string>();
  for (const t of toolCalls) {
    if (t.tool !== 'run_tests' || t.status !== 'ok' || !t.structuredRef) continue;
    const s = structured[t.structuredRef];
    if (s?.kind !== 'run_tests') continue;
    if (s.compile && !s.compile.ok) {
      const group = typeof t.args.group === 'string' ? t.args.group : null;
      for (const c of cases) if (group === null || c.group === group) covered.add(key(c));
    } else {
      for (const c of s.cases) covered.add(key(c));
    }
  }
  return cases.filter((c) => !covered.has(key(c)));
}
