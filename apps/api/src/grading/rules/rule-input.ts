import { BadRequestException } from '@nestjs/common';
import type { RulePredicate } from '../decision/types';
import { parseHundredths } from '../scoring/hundredths';

export interface RuleInput {
  ruleKey: string;
  name: string;
  description: string;
  criterionKey: string;
  predicate: RulePredicate | null;
}
export type RuleChanges = Partial<Omit<RuleInput, 'ruleKey'>>;

const KEY = /^[a-z0-9_]{1,64}$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

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

export function parseRuleInput(x: unknown): RuleInput {
  const o = (x ?? {}) as Record<string, unknown>;
  return {
    ruleKey: key(o.ruleKey, 'ruleKey'),
    name: text(o.name, 'name', 200),
    description: text(o.description, 'description', 2000),
    criterionKey: key(o.criterionKey, 'criterionKey'),
    predicate: parsePredicate(o.predicate === undefined ? null : o.predicate),
  };
}

export function parseRuleChanges(x: unknown): RuleChanges {
  const o = (x ?? {}) as Record<string, unknown>;
  const out: RuleChanges = {};
  if (o.name !== undefined) out.name = text(o.name, 'name', 200);
  if (o.description !== undefined) out.description = text(o.description, 'description', 2000);
  if (o.criterionKey !== undefined) out.criterionKey = key(o.criterionKey, 'criterionKey');
  if (o.predicate !== undefined) out.predicate = parsePredicate(o.predicate);
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
