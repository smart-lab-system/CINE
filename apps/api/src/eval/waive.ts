import { isMachineChecked } from '../grading/decision/predicates';
import type { Manifest } from './manifest.schema';

/**
 * `--waive` của eval (P0): bỏ khỏi lượt chạy các luật mà máy CHƯA đo được của những tiêu chí được nêu.
 *
 * Vì sao không dùng `manifest.waivedCriteria` một mình: nó chỉ tắt cờ `criterion_without_rules`
 * (tiêu chí không có luật nào). Một tiêu chí có luật mang `predicate` chưa đo được
 * (`complexity_exceeds_required`, `calls_function`, `no_recursion`) vẫn bị `decide()` gắn
 * `criterion_untouched` ở MỌI ca, nên không ca nào tới được tự quyết và nhóm tự quyết của eval có
 * mẫu số 0. Ngữ nghĩa của `waivedCriteria` ở đường chấm thật (bảng `criterion_waiver`) không được
 * đổi để chữa chuyện này — đó là đổi kết cục chấm thật.
 *
 * Nên cơ chế này CHỈ nằm ở eval, trong bộ nhớ (fixture trên đĩa và `datasetHash` không đổi), và làm
 * đúng ba việc, nhất quán với nhau:
 *   1. bỏ các luật có `predicate` chưa đo được của tiêu chí được nêu (cả agent lẫn `decide()` đều
 *      không còn thấy chúng);
 *   2. bỏ khoá luật đó khỏi `expectedRuleIds` của mọi ca, để điểm kỳ vọng tính trên cùng bảng luật;
 *   3. tiêu chí nào VỪA bị bỏ luật và mất hết luật thì đánh dấu miễn (`criterion_without_rules` không
 *      còn chặn); tiêu chí vốn không có luật nào thì không bị đụng tới.
 * Luật lời (`predicate: null`, model quyết) và luật máy đo được ở lại.
 *
 * Kết quả là một bài toán chấm THU HẸP, đo đúng thứ máy đo được hôm nay; lượt chạy phải ghi
 * `waived` trong config và so ghép báo lẫn biến.
 *
 * @returns khoá các luật đã bỏ, theo thứ tự trong bảng luật.
 */
export function waiveUnmeasured(manifest: Manifest, criteria: readonly string[]): string[] {
  const named = new Set(criteria);
  const removed = manifest.rules
    .filter((r) => named.has(r.criterionKey) && r.predicate !== null && !isMachineChecked(r.predicate))
    .map((r) => r.ruleKey);
  const gone = new Set(removed);
  const touched = new Set(manifest.rules.filter((r) => gone.has(r.ruleKey)).map((r) => r.criterionKey));
  manifest.rules = manifest.rules.filter((r) => !gone.has(r.ruleKey));
  for (const c of manifest.cases) c.expectedRuleIds = c.expectedRuleIds.filter((key) => !gone.has(key));
  // Chỉ tiêu chí VỪA bị bỏ luật mà hết luật mới được miễn; tiêu chí vốn không có luật nào thì giữ nguyên cờ
  // `criterion_without_rules` (không âm thầm tắt nó chỉ vì có tên trong `--waive`).
  const emptied = [...named].filter((key) => touched.has(key) && !manifest.rules.some((r) => r.criterionKey === key));
  manifest.waivedCriteria = [...new Set([...manifest.waivedCriteria, ...emptied])];
  return removed;
}
