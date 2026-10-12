import type { NewErrorInput } from './api/rubric-errors';
import type { ErrorChanges, RulePredicate } from './api/rules';

/**
 * Logic thuần của form lỗi (ngăn kéo "Thêm lỗi" và "Sửa lỗi", spec mục 5.4–5.5, D9). Giao diện chỉ có HAI cách
 * phát hiện: Tự động (nhóm test trượt) và AI đọc bài (không có điều kiện). Ba mẫu điều kiện cũ vẫn chạy ở máy chủ
 * và hiện như "AI đọc bài" kèm ghi chú — form KHÔNG BAO GIỜ gửi `predicate` nếu giảng viên không đổi cách phát hiện,
 * để sửa tên một lỗi cũ không âm thầm xoá điều kiện của nó (Review Focus 6).
 */

export type Detection = 'auto' | 'ai';

export interface ErrorFormState {
  name: string;
  description: string;
  detection: Detection;
  /** Tên nhóm test; chỉ có nghĩa khi `detection === 'auto'`. */
  group: string;
}

export const EMPTY_ERROR_FORM: ErrorFormState = { name: '', description: '', detection: 'ai', group: '' };

const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
const GROUP_MAX = 100;

export function detectionOf(predicate: RulePredicate | null): { detection: Detection; group: string; legacyNote: string | null } {
  if (predicate === null) return { detection: 'ai', group: '', legacyNote: null };
  switch (predicate.kind) {
    case 'test_group_failed':
      return { detection: 'auto', group: predicate.group, legacyNote: null };
    case 'calls_function':
      return { detection: 'ai', group: '', legacyNote: `gọi hàm “${predicate.name}”` };
    case 'complexity_exceeds_required':
      return { detection: 'ai', group: '', legacyNote: 'độ phức tạp vượt yêu cầu của đề' };
    case 'no_recursion':
      return {
        detection: 'ai',
        group: '',
        legacyNote: predicate.functionName ? `không dùng đệ quy trong hàm “${predicate.functionName}”` : 'không dùng đệ quy',
      };
  }
}

type RuleLike = { revision: { name: string; description: string; predicate: RulePredicate | null } };

export function formFromRule(rule: RuleLike): ErrorFormState {
  const d = detectionOf(rule.revision.predicate);
  return { name: rule.revision.name, description: rule.revision.description, detection: d.detection, group: d.group };
}

export interface ErrorFormErrors {
  name?: string;
  description?: string;
  group?: string;
}

export function validateErrorForm(form: ErrorFormState): ErrorFormErrors {
  const errors: ErrorFormErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'Đặt tên cho lỗi này.';
  else if (name.length > NAME_MAX) errors.name = `Tên tối đa ${NAME_MAX} ký tự.`;
  const description = form.description.trim();
  if (description === '') errors.description = 'Mô tả lỗi để giảng viên khác và AI hiểu cùng một nghĩa.';
  else if (description.length > DESCRIPTION_MAX) errors.description = `Mô tả tối đa ${DESCRIPTION_MAX} ký tự.`;
  if (form.detection === 'auto') {
    const group = form.group.trim();
    if (group === '') errors.group = 'Nhập tên nhóm test.';
    else if (group.length > GROUP_MAX) errors.group = `Tên nhóm tối đa ${GROUP_MAX} ký tự.`;
  }
  return errors;
}

export function predicateOf(form: ErrorFormState): RulePredicate | null {
  return form.detection === 'auto' ? { kind: 'test_group_failed', group: form.group.trim() } : null;
}

/** Lỗi MỚI. `ruleKey` do máy chủ sinh từ tên — form không bao giờ gửi nó (spec 4.2). */
export function buildNewRule(form: ErrorFormState): NewErrorInput {
  return { name: form.name.trim(), description: form.description.trim(), predicate: predicateOf(form) };
}

/**
 * Chỉ những gì ĐÃ ĐỔI so với lỗi gốc. `predicate` chỉ có mặt khi cách phát hiện đổi (auto ⇄ ai) hoặc nhóm test
 * của lỗi Tự động đổi; lỗi cũ mang điều kiện lạ mà vẫn để "AI đọc bài" thì không gửi `predicate`.
 */
export function buildChanges(rule: RuleLike, form: ErrorFormState): ErrorChanges {
  const orig = formFromRule(rule);
  const changes: ErrorChanges = {};
  if (form.name.trim() !== orig.name) changes.name = form.name.trim();
  if (form.description.trim() !== orig.description) changes.description = form.description.trim();
  const detectionChanged = form.detection !== orig.detection;
  const groupChanged = form.detection === 'auto' && form.group.trim() !== orig.group;
  if (detectionChanged || groupChanged) changes.predicate = predicateOf(form);
  return changes;
}

export const isDirty = (rule: RuleLike, form: ErrorFormState): boolean => Object.keys(buildChanges(rule, form)).length > 0;
