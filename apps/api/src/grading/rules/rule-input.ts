import { BadRequestException } from '@nestjs/common';
import type { RulePredicate } from '../decision/types';
import { parseHundredths } from '../scoring/hundredths';

export interface NewRuleInput {
  name: string;
  description: string;
  predicate: RulePredicate | null;
  /** Chỉ dành cho công cụ (lệnh diễn tập). Giao diện KHÔNG BAO GIỜ gửi nó — server sinh từ tên. */
  ruleKey?: string;
}
export type RuleChanges = Partial<Pick<NewRuleInput, 'name' | 'description' | 'predicate'>>;
export interface AssignInput {
  rubricName: string;
  criterionKey: string;
  deduction?: string | null;
  ruleId?: string;
  newRule?: NewRuleInput;
  /** Chỉ cho lỗi `proposed` được duyệt: sửa rồi kích hoạt. */
  changes?: RuleChanges;
}

const KEY = /^[a-z0-9_]{1,64}$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bad = (msg: string): never => {
  throw new BadRequestException(msg);
};

function text(x: unknown, field: string, max: number): string {
  if (typeof x !== 'string' || x.trim().length === 0 || x.length > max) bad(`${field}: chuỗi 1–${max} ký tự`);
  return (x as string).trim();
}

function key(x: unknown, field: string): string {
  if (typeof x !== 'string' || !KEY.test(x)) bad(`${field}: chỉ chữ thường, số, gạch dưới, 1–64 ký tự`);
  return x as string;
}

/**
 * Đúng bốn mẫu của §4.1 — không có mẫu thứ năm, không code tự do (rủi ro 10). Một chỗ kiểm cho cả
 * route lẫn service: body có `predicate` lồng bốn hình dạng, class-validator không tả gọn được.
 */
export function parsePredicate(x: unknown): RulePredicate | null {
  if (x === null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) return bad('điều kiện: null hoặc một trong bốn mẫu');
  const o = x as Record<string, unknown>;
  const only = (...allowed: string[]) => {
    if (Object.keys(o).some((k) => !allowed.includes(k))) bad(`điều kiện ${String(o.kind)}: có trường lạ`);
  };
  switch (o.kind) {
    case 'test_group_failed':
      only('kind', 'group');
      if (typeof o.group !== 'string' || o.group.length < 1 || o.group.length > 100) {
        bad('điều kiện test_group_failed: thiếu nhóm');
      }
      return { kind: 'test_group_failed', group: o.group as string };
    case 'calls_function':
      only('kind', 'name');
      if (typeof o.name !== 'string' || !IDENT.test(o.name)) bad('điều kiện calls_function: tên hàm không hợp lệ');
      return { kind: 'calls_function', name: o.name as string };
    case 'complexity_exceeds_required':
      only('kind');
      return { kind: 'complexity_exceeds_required' };
    case 'no_recursion':
      only('kind', 'functionName');
      if (o.functionName !== undefined && (typeof o.functionName !== 'string' || !IDENT.test(o.functionName))) {
        bad('điều kiện no_recursion: tên hàm không hợp lệ');
      }
      return o.functionName === undefined
        ? { kind: 'no_recursion' }
        : { kind: 'no_recursion', functionName: o.functionName as string };
    default:
      return bad('điều kiện: mẫu không có trong bốn mẫu của §4.1');
  }
}

export function parseNewRule(x: unknown): NewRuleInput {
  const o = (x ?? {}) as Record<string, unknown>;
  const out: NewRuleInput = {
    name: text(o.name, 'name', 200),
    description: text(o.description, 'description', 2000),
    predicate: parsePredicate(o.predicate === undefined ? null : o.predicate),
  };
  if (o.ruleKey !== undefined) out.ruleKey = key(o.ruleKey, 'ruleKey');
  return out;
}

export function parseRuleChanges(x: unknown): RuleChanges {
  const o = (x ?? {}) as Record<string, unknown>;
  const out: RuleChanges = {};
  if (o.name !== undefined) out.name = text(o.name, 'name', 200);
  if (o.description !== undefined) out.description = text(o.description, 'description', 2000);
  if (o.predicate !== undefined) out.predicate = parsePredicate(o.predicate);
  return out;
}

export function parseAssignInput(x: unknown): AssignInput {
  const o = (x ?? {}) as Record<string, unknown>;
  const hasRule = o.ruleId !== undefined;
  const hasNew = o.newRule !== undefined;
  if (hasRule === hasNew) bad('Gửi đúng một trong ruleId hoặc newRule');
  if (hasNew && o.changes !== undefined) bad('changes chỉ đi cùng ruleId');
  const out: AssignInput = {
    rubricName: text(o.rubricName, 'rubricName', 200),
    criterionKey: key(o.criterionKey, 'criterionKey'),
  };
  if (o.deduction !== undefined) out.deduction = parseDeduction(o.deduction);
  if (hasRule) {
    if (typeof o.ruleId !== 'string' || !UUID.test(o.ruleId)) bad('ruleId: không phải uuid');
    out.ruleId = o.ruleId as string;
    if (o.changes !== undefined) out.changes = parseRuleChanges(o.changes);
  } else {
    out.newRule = parseNewRule(o.newRule);
  }
  return out;
}

/** Mức trừ: null (chưa có giá) hoặc chuỗi thập phân — không nhận `number` (§13.2: không qua số thực). */
export function parseDeduction(x: unknown): string | null {
  if (x === null) return null;
  if (typeof x !== 'string') return bad('mức trừ: chuỗi thập phân tối đa hai chữ số lẻ, hoặc null');
  try {
    parseHundredths(x);
  } catch {
    bad('mức trừ: chuỗi thập phân tối đa hai chữ số lẻ, không âm');
  }
  return x.trim();
}
