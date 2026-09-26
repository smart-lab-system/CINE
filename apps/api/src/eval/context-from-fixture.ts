import { isMachineChecked } from '../grading/decision/predicates';
import { ErrorRule } from '../grading/decision/types';
import { InvestigationBudget, InvestigationContext } from '../grading/investigator/types';
import { parseHundredths } from '../grading/scoring/hundredths';
import { LoadedDe } from './load-dataset';
import { ManifestCase } from './manifest.schema';
import { FrozenBundle } from './test-bundle';

/** Model đọc dòng này ở bang-loi.md: máy kiểm bằng gì, hay vì sao chưa kiểm được (Q1). */
function noteOf(p: LoadedDe['manifest']['rules'][number]['predicate']): string | null {
  if (!p) return null;
  if (p.kind === 'test_group_failed') return `nhóm test ${p.group}`;
  return 'máy chưa đo được — bạn phán đoán';
}

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
      checkedBy: isMachineChecked(r.predicate) ? 'machine' : 'model',
      machineNote: noteOf(r.predicate),
    })),
    budget,
  };
}

/** Bảng lỗi của đề cho `decide()` — mức trừ bằng số nguyên phần trăm điểm (§13.2). */
export function errorRulesOf(de: LoadedDe): ErrorRule[] {
  return de.manifest.rules.map((r) => ({
    ruleKey: r.ruleKey,
    criterionKey: r.criterionKey,
    deductionHundredths: r.deduction === null ? null : parseHundredths(r.deduction),
    predicate: r.predicate,
  }));
}
