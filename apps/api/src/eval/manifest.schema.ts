import { z } from 'zod';

/**
 * Schema của một đề trong bộ dữ liệu eval (spec 2026-09-20 §12.2).
 *
 * Tiền và điểm là CHUỖI ("8.50"), đọc thẳng thành số nguyên phần trăm điểm
 * bằng `parseHundredths` — không bao giờ qua float (§13.2).
 */
const money = z.string().regex(/^\d{1,4}(\.\d{1,2})?$/, 'điểm dạng "8.50"');

const predicate = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('test_group_failed'), group: z.string().min(1) }),
  z.object({ kind: z.literal('calls_function'), name: z.string().min(1) }),
  z.object({ kind: z.literal('complexity_exceeds_required') }),
  z.object({ kind: z.literal('no_recursion'), functionName: z.string().optional() }),
]);

const manifestCase = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]+$/),
    group: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    file: z.string().min(1),
    /** Nhóm 5: băm của bài thật — commit được, bài thì không (§12.7). */
    sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    behavior: z.enum(['dynamic', 'static']),
    expectedRuleIds: z.array(z.string()),
    expectedOutcome: z.enum(['graded', 'ungradable', 'flagged']),
    expectedScore: money.nullable(),
    expectedComplexity: z.string().nullable(),
    cleanTwin: z.string().nullable(),
    note: z.string(),
  })
  .refine((c) => c.group !== 5 || c.sha256 !== undefined, { message: 'ca nhóm 5 phải có sha256 của bài' });

export const manifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  split: z.enum(['dev', 'test']),
  language: z.literal('cpp'),
  statement: z.string().min(1),
  requiredComplexity: z.string().nullable(),
  driver: z.string().min(1),
  modelAnswer: z.string().min(1),
  tests: z.string().min(1),
  probes: z.string().min(1),
  rubric: z.array(z.object({ key: z.string(), description: z.string(), maxPoints: money })).min(1),
  rules: z.array(
    z.object({
      ruleKey: z.string().regex(/^[a-z0-9_]+$/),
      title: z.string().min(1),
      criterionKey: z.string(),
      deduction: money.nullable(),
      predicate: predicate.nullable(),
    }),
  ),
  cases: z.array(manifestCase).min(1),
});
export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestCase = z.infer<typeof manifestCase>;
export type RulePredicate = z.infer<typeof predicate>;

const generate = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('shuffle_range'), n: z.number().int().positive(), lo: z.number().int(), seed: z.number().int() }),
  z.object({ kind: z.literal('nested'), open: z.string().length(1), close: z.string().length(1), depth: z.number().int().positive() }),
  z.object({ kind: z.literal('repeat'), unit: z.string().min(1), times: z.number().int().positive() }),
]);
export const testsSchema = z.array(
  z
    .object({
      key: z.string().regex(/^[A-Za-z0-9_-]+$/),
      group: z.string().min(1),
      input: z.string().optional(),
      expected: z.string().optional(),
      generate: generate.optional(),
    })
    .refine((t) => (t.input !== undefined) !== (t.generate !== undefined), {
      message: 'mỗi ca có đúng một trong hai: input, hoặc generate',
    })
    .refine((t) => t.generate === undefined || t.expected === undefined, {
      message: 'ca sinh tự động lấy output mong đợi từ đáp án mẫu, không ghi tay',
    }),
).superRefine((tests, ctx) => {
  // Review M5: key là tên ca trong gói test — trùng thì output sinh ra gán nhầm ca, và sàn
  // T-FLOOR-3 đếm độ phủ nhầm. Key phải duy nhất trên CẢ gói, không chỉ trong một nhóm.
  const seen = new Set<string>();
  for (const [i, t] of tests.entries()) {
    if (seen.has(t.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'key'], message: `trùng key: ${t.key}` });
    seen.add(t.key);
  }
});
export type TestCaseSpec = z.infer<typeof testsSchema>[number];
export const probesSchema = z.array(z.object({ key: z.string().regex(/^[A-Za-z0-9_-]+$/), input: z.string() }));
