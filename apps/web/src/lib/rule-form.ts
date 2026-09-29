import type { Rule, RuleInput, RulePredicate } from './api/rules';
import { parseDeductionInput, slugifyRuleKey } from './rules-vocab';

/**
 * Logic thuần của form luật (spec §3.2) — tách khỏi React để test được từng luật và để giữ MỘT nơi
 * biết "mẫu nào máy đo được". Giới hạn ở đây phản chiếu `apps/api/src/grading/rules/rule-input.ts`:
 * server vẫn là bên quyết định, form chỉ báo sớm để giảng viên không phải gửi rồi mới biết.
 */

export type RuleMode = 'machine' | 'words';
export type RuleTemplate = 'tests' | 'call' | 'complexity' | 'recursion';

export interface RuleFormState {
  name: string;
  description: string;
  criterionKey: string;
  mode: RuleMode;
  template: RuleTemplate;
  /** Tham số của mẫu đang chọn (nhóm test / tên hàm); bỏ qua ở chế độ "bằng lời" và mẫu không tham số. */
  param: string;
  /** Mức trừ như người dùng gõ ("1,5"); rỗng = chưa có giá. */
  price: string;
}

export const EMPTY_FORM: RuleFormState = {
  name: '',
  description: '',
  criterionKey: '',
  mode: 'words',
  template: 'tests',
  param: '',
  price: '',
};

export type ParamKind = 'group' | 'identifier' | 'optional-identifier' | 'none';

export interface TemplateMeta {
  label: string;
  hint: string;
  param: ParamKind;
  paramLabel?: string;
  paramPlaceholder?: string;
  /**
   * Máy đo được ở bản này? Chỉ *nhóm test trượt* — ba mẫu còn lại lưu được điều kiện nhưng đường chấm
   * chưa đo (`checkedBy = 'model'`, §4.6). Nói đúng như vậy thay vì hứa "máy quyết" (spec §2.2).
   */
  measurable: boolean;
}

export const TEMPLATE_META: Record<RuleTemplate, TemplateMeta> = {
  tests: {
    label: 'Một nhóm test bị trượt',
    hint: 'Bài trượt nhóm test này thì bị lỗi. Máy đo được ngay trên kết quả chạy bài.',
    param: 'group',
    paramLabel: 'Tên nhóm test',
    paramPlaceholder: 'vd: bien, mang_rong',
    measurable: true,
  },
  call: {
    label: 'Mã có gọi một hàm nhất định',
    hint: 'Bài có gọi hàm này thì bị lỗi (vd cấm dùng sort có sẵn).',
    param: 'identifier',
    paramLabel: 'Tên hàm',
    paramPlaceholder: 'vd: sort',
    measurable: false,
  },
  complexity: {
    label: 'Độ phức tạp vượt yêu cầu',
    hint: 'Bài chạy chậm hơn độ phức tạp đề yêu cầu thì bị lỗi.',
    param: 'none',
    measurable: false,
  },
  recursion: {
    label: 'Không được dùng đệ quy',
    hint: 'Bài dùng đệ quy thì bị lỗi. Có thể giới hạn cho một hàm cụ thể.',
    param: 'optional-identifier',
    paramLabel: 'Tên hàm (tuỳ chọn)',
    paramPlaceholder: 'để trống = mọi hàm',
    measurable: false,
  },
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
const GROUP_MAX = 100;

/** Điều kiện gửi lên server; `null` = luật bằng lời (gửi rõ ràng để chuyển máy kiểm → bằng lời xoá điều kiện). */
export function predicateFromForm(form: RuleFormState): RulePredicate | null {
  if (form.mode === 'words') return null;
  const param = form.param.trim();
  switch (form.template) {
    case 'tests':
      return { kind: 'test_group_failed', group: param };
    case 'call':
      return { kind: 'calls_function', name: param };
    case 'complexity':
      return { kind: 'complexity_exceeds_required' };
    case 'recursion':
      // Server 400 nếu có `functionName` mà rỗng/sai — nên để trống thì KHÔNG gửi khoá này.
      return param === '' ? { kind: 'no_recursion' } : { kind: 'no_recursion', functionName: param };
  }
}

/** Bậc áp dụng của luật này (§2.2): 2 = tính lại bài đã chấm, 3 = chỉ áp từ phiên chưa chấm, 4 = bằng lời. */
export function tierOf(form: Pick<RuleFormState, 'mode' | 'template'>): 2 | 3 | 4 {
  if (form.mode === 'words') return 4;
  return TEMPLATE_META[form.template].measurable ? 2 : 3;
}

export function formFromRule(rule: Rule): RuleFormState {
  const base: RuleFormState = {
    ...EMPTY_FORM,
    name: rule.revision.name,
    description: rule.revision.description,
    criterionKey: rule.revision.criterionKey,
    price: rule.deduction === null ? '' : String(Number(rule.deduction)).replace('.', ','),
  };
  const p = rule.revision.predicate;
  if (p === null || p === undefined) return base;
  switch (p.kind) {
    case 'test_group_failed':
      return { ...base, mode: 'machine', template: 'tests', param: p.group };
    case 'calls_function':
      return { ...base, mode: 'machine', template: 'call', param: p.name };
    case 'complexity_exceeds_required':
      return { ...base, mode: 'machine', template: 'complexity' };
    case 'no_recursion':
      return { ...base, mode: 'machine', template: 'recursion', param: p.functionName ?? '' };
  }
}

export interface RuleFormErrors {
  name?: string;
  description?: string;
  criterionKey?: string;
  param?: string;
  price?: string;
}

export function validateRuleForm(form: RuleFormState): RuleFormErrors {
  const errors: RuleFormErrors = {};

  const name = form.name.trim();
  if (name === '') errors.name = 'Đặt tên cho lỗi này.';
  else if (name.length > NAME_MAX) errors.name = `Tên tối đa ${NAME_MAX} ký tự.`;

  const description = form.description.trim();
  if (description === '') errors.description = 'Mô tả lỗi để giảng viên khác và agent hiểu cùng một nghĩa.';
  else if (description.length > DESCRIPTION_MAX) errors.description = `Mô tả tối đa ${DESCRIPTION_MAX} ký tự.`;

  if (form.criterionKey === '') errors.criterionKey = 'Chọn tiêu chí mà lỗi này thuộc về.';

  if (form.mode === 'machine') {
    const param = form.param.trim();
    switch (TEMPLATE_META[form.template].param) {
      case 'group':
        if (param === '') errors.param = 'Nhập tên nhóm test.';
        else if (param.length > GROUP_MAX) errors.param = `Tên nhóm tối đa ${GROUP_MAX} ký tự.`;
        break;
      case 'identifier':
        if (!IDENT.test(param)) errors.param = 'Tên hàm: chữ, số, gạch dưới; không bắt đầu bằng số.';
        break;
      case 'optional-identifier':
        if (param !== '' && !IDENT.test(param)) errors.param = 'Tên hàm: chữ, số, gạch dưới; không bắt đầu bằng số.';
        break;
      case 'none':
        break;
    }
  }

  const price = parseDeductionInput(form.price);
  if (!price.ok) errors.price = price.message;

  return errors;
}

/** Tạo luật: khoá `ruleKey` sinh từ tên — giảng viên không phải biết nó tồn tại, và nó không đổi được về sau. */
export function buildRuleInput(form: RuleFormState): Required<Pick<RuleInput, 'ruleKey' | 'name' | 'description' | 'criterionKey'>> & {
  predicate: RulePredicate | null;
} {
  return {
    ruleKey: slugifyRuleKey(form.name.trim()),
    ...buildRuleChanges(form),
  };
}

/** Sửa luật: mọi trường trừ `ruleKey` (server không nhận đổi khoá). */
export function buildRuleChanges(form: RuleFormState): {
  name: string;
  description: string;
  criterionKey: string;
  predicate: RulePredicate | null;
} {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    criterionKey: form.criterionKey,
    predicate: predicateFromForm(form),
  };
}

export type RulePreviewInput = ReturnType<typeof buildRuleChanges> & {
  ruleKey: string;
  ruleId?: string;
  deduction: string | null;
};

/**
 * Thân của POST /rules/preview. Server đòi ĐỦ một luật hợp lệ (parseRuleInput) mới trả lời — nên form chưa
 * hợp lệ thì trả null, đừng hỏi một câu server chắc chắn từ chối. Sửa luật có sẵn thì giữ NGUYÊN khoá và gửi
 * kèm `ruleId` để bản nháp thay thế luật đó thay vì nhân đôi nó; luật mới thì khoá sinh từ tên.
 * Mức trừ để trống gửi `null` tường minh (chưa có giá).
 */
export function previewInputOf(
  form: RuleFormState,
  existing: { id: string; ruleKey: string } | undefined,
): RulePreviewInput | null {
  if (Object.keys(validateRuleForm(form)).length > 0) return null;
  const price = parseDeductionInput(form.price);
  if (!price.ok) return null;
  return {
    ruleKey: existing?.ruleKey ?? slugifyRuleKey(form.name.trim()),
    ...(existing ? { ruleId: existing.id } : {}),
    ...buildRuleChanges(form),
    deduction: price.value,
  };
}

/** Những bước đã ghi thành công — để một lần lưu dở dang thử lại đúng chỗ, không ghi lại bước đã xong. */
export interface SaveProgress {
  /** Luật vừa được TẠO trong phiên làm việc này (luật mới); luật có sẵn dùng `rule.id`. */
  ruleId?: string;
  /** Khoá luật vừa tạo — để xem trước gửi đúng khoá thay vì sinh lại từ một cái tên đã sửa. */
  ruleKey?: string;
  /** Dấu vân tay của phần luật đã ghi lần cuối (tên/mô tả/tiêu chí/điều kiện). */
  writtenKey?: string;
  activated?: boolean;
  /** Giá đã ghi lần cuối; `undefined` = chưa ghi lần nào (khi đó so với giá của luật). */
  price?: string | null;
}

export interface SavePlan {
  write: 'create' | 'revise' | null;
  activate: boolean;
  price: { value: string | null } | null;
}

/**
 * Còn phải ghi gì. MỘT hàm cho cả ba luồng (tạo mới · sửa · duyệt luật agent đề xuất), nên nút Lưu, câu
 * "Chưa đổi gì" và việc thử lại sau lỗi giữa chừng cùng đọc một sự thật:
 * - luật mới → tạo; giá chỉ ghi khi có gõ (luật mới khởi đầu chưa có giá);
 * - luật sẵn → chỉ tạo bản sửa khi một trường luật ĐỔI, và chỉ ghi giá khi giá ĐỔI (so số, không so chuỗi);
 * - luật agent đề xuất (`proposed`) → luôn bản sửa (gắn tiêu chí/điều kiện) rồi kích hoạt;
 * - bước đã ghi (`progress`) là mốc mới: sửa tiếp sau khi tạo thì thành bản sửa của luật VỪA tạo, không tạo lần hai.
 */
export function planSave(form: RuleFormState, rule: Rule | undefined, progress: SaveProgress): SavePlan {
  const ruleId = rule?.id ?? progress.ruleId;
  const changesKey = JSON.stringify(buildRuleChanges(form));
  const baselineKey =
    progress.writtenKey ??
    (rule && rule.state !== 'proposed' ? JSON.stringify(buildRuleChanges(formFromRule(rule))) : undefined);
  const write = ruleId === undefined ? 'create' : changesKey !== baselineKey ? 'revise' : null;

  const activate = rule?.state === 'proposed' && !progress.activated;

  const typed = parseDeductionInput(form.price);
  const baselinePrice = progress.price !== undefined ? progress.price : (rule?.deduction ?? null);
  const price = typed.ok && !samePrice(typed.value, baselinePrice) ? { value: typed.value } : null;

  return { write, activate, price };
}

/** Nút lưu nói đúng hệ quả (spec §3.2): chỉ bậc 2 mới tính lại bài đã chấm. */
export function saveLabelOf(tier: 2 | 3 | 4, matchCount: number | undefined): string {
  if (tier === 2) return matchCount === undefined ? 'Lưu và áp cho các bài khớp' : `Lưu và áp cho ${matchCount} bài`;
  return 'Lưu luật — áp từ phiên chưa chấm';
}

/** Giá lưu ("1.50") có bằng giá đang nhập/đã lưu ("1.5") không — so số, không so chuỗi. */
export function samePrice(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Number(a) === Number(b);
}
