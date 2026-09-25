import { InvestigationBudget, InvestigationContext } from '../grading/investigator/types';
import { LoadedDe } from './load-dataset';
import { ManifestCase } from './manifest.schema';
import { FrozenBundle } from './test-bundle';

/**
 * Ngữ cảnh của một ca, dựng HOÀN TOÀN từ fixture đã đóng băng (§12.2, T-EVAL-7): bảng lỗi,
 * đề và gói test là của fixture, nên sửa bảng lỗi đang sống của một giảng viên không đổi
 * được gì ở đây — và runner không có kết nối DB nào để mà đọc nó.
 */
export function contextFor(
  de: LoadedDe,
  c: ManifestCase,
  bundle: FrozenBundle,
  budget: InvestigationBudget,
): InvestigationContext {
  return {
    language: de.manifest.language,
    problemStatement: de.manifest.statement,
    requiredComplexity: de.manifest.requiredComplexity,
    submission: { files: [{ path: 'main.cpp', content: de.sources.get(c.id) ?? '' }] },
    driver: de.driverSource,
    entry: null,
    testBundle: bundle,
    modelAnswerAvailable: true,
    rules: de.manifest.rules.map((r) => ({
      ruleKey: r.ruleKey,
      title: r.title,
      criterionKey: r.criterionKey,
      priced: r.deduction !== null,
      hasPredicate: r.predicate !== null,
    })),
    budget,
  };
}
