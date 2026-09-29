'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AutoTextarea } from '@/components/ui/auto-textarea';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useCreateRule, usePreviewRule, useReviseRule, useSetPrice, useSetRuleState } from '@/hooks/useRules';
import { useRubrics } from '@/hooks/useGrading';
import { formatVnPoints } from '@/lib/format';
import {
  EMPTY_FORM,
  TEMPLATE_META,
  buildRuleChanges,
  buildRuleInput,
  formFromRule,
  planSave,
  previewInputOf,
  saveLabelOf,
  tierOf,
  validateRuleForm,
  type RuleFormErrors,
  type RuleFormState,
  type RuleTemplate,
  type SaveProgress,
} from '@/lib/rule-form';
import { activeCriteria } from '@/lib/rubric-form';
import { describeRecompute } from '@/lib/rules-vocab';
import type { Rule } from '@/lib/api/rules';
import { ApplyPreview, type PreviewState } from './ApplyPreview';

/** Chờ gõ xong rồi mới hỏi — mỗi lần hỏi là một lượt tính lại nháp trên mọi bài của giảng viên. */
export const PREVIEW_DEBOUNCE_MS = 500;

const TEMPLATES = Object.keys(TEMPLATE_META) as RuleTemplate[];

function initialForm(rule: Rule | undefined): RuleFormState {
  if (!rule) return EMPTY_FORM;
  const form = formFromRule(rule);
  // Luật agent đề xuất luôn mang tiêu chí "chưa gán" — agent không biết tiêu chí nào; giảng viên chọn.
  return rule.state === 'proposed' ? { ...form, criterionKey: '' } : form;
}

/**
 * Tạo / sửa / duyệt một luật (spec §3.2) — bốn khối: lỗi là gì · thuộc tiêu chí nào · nhận ra bằng cách nào ·
 * mức trừ. Cột phải là "Lưu thì áp vào đâu".
 *
 * Ba luồng, MỘT hàm quyết định còn phải ghi gì (`planSave`):
 * - không có `rule` → tạo; giá chỉ ghi khi có gõ;
 * - `rule` đang dùng → bản sửa nếu trường luật đổi, giá nếu giá đổi;
 * - `rule.state === 'proposed'` (luật agent báo, từ "Luật còn thiếu") → bản sửa, kích hoạt, rồi giá.
 * Mỗi bước thành công ghi vào `progress`, nên lỗi giữa chừng rồi bấm Lưu lại chỉ làm phần còn dở.
 *
 * Bậc hiệu lực = bậc SERVER trả khi có; máy không tự giữ danh sách mẫu nào đo được ngoài giá trị mặc định
 * để vẽ nhãn trước khi server trả lời (spec §3.2: nhãn tự mất khi API nói máy đo được).
 */
export function RuleForm({ rule }: { rule?: Rule }) {
  const promote = rule?.state === 'proposed';
  const [form, setForm] = useState<RuleFormState>(() => initialForm(rule));
  const [touched, setTouched] = useState<ReadonlySet<keyof RuleFormErrors>>(new Set());
  const [progress, setProgress] = useState<SaveProgress>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<{ label: string; text: string }[] | null>(null);

  const rubrics = useRubrics();
  const criteria = useMemo(() => activeCriteria(rubrics.data), [rubrics.data]);
  const create = useCreateRule();
  const revise = useReviseRule();
  const setState = useSetRuleState();
  const setPrice = useSetPrice();

  const errors = validateRuleForm(form);
  const valid = Object.keys(errors).length === 0;
  const plan = planSave(form, rule, progress);
  const changed = plan.write !== null || plan.activate || plan.price !== null;
  const canSave = valid && changed && !saving;

  const shown = (field: keyof RuleFormErrors) => (touched.has(field) ? errors[field] : undefined);
  const touch = (field: keyof RuleFormErrors) => setTouched((prev) => new Set(prev).add(field));
  const update = (patch: Partial<RuleFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setSummaries(null);
  };

  // ── Xem trước "Lưu thì áp vào đâu" ────────────────────────────────────────────────────────────
  const preview = usePreviewRule();
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const existing = rule
    ? { id: rule.id, ruleKey: rule.ruleKey }
    : progress.ruleId && progress.ruleKey
      ? { id: progress.ruleId, ruleKey: progress.ruleKey }
      : undefined;
  const previewInput = previewInputOf(form, existing);
  const previewKey = previewInput ? JSON.stringify(previewInput) : null;

  useEffect(() => {
    if (previewKey === null) {
      previewRef.current.reset();
      return;
    }
    const timer = setTimeout(() => previewRef.current.mutate(JSON.parse(previewKey)), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [previewKey]);

  // Chỉ nhận câu trả lời của ĐÚNG câu hỏi đang hiện tại — câu trả lời của nội dung đã gõ đè thì bỏ.
  const answeredKey = preview.variables !== undefined ? JSON.stringify(preview.variables) : null;
  let previewState: PreviewState;
  if (previewKey === null) previewState = { status: 'invalid' };
  else if (answeredKey === previewKey && preview.isError) previewState = { status: 'error', message: preview.error.message };
  else if (answeredKey === previewKey && preview.data) previewState = { status: 'ready', preview: preview.data };
  else previewState = { status: 'loading' };

  const serverTier = previewState.status === 'ready' ? previewState.preview.tier : null;
  const tier = serverTier ?? tierOf(form);
  const matchCount =
    previewState.status === 'ready' && previewState.preview.tier === 2 ? previewState.preview.results.length : undefined;

  // ── Lưu ───────────────────────────────────────────────────────────────────────────────────────
  async function save() {
    setSaving(true);
    setError(null);
    const notes: { label: string; text: string }[] = [];
    let p: SaveProgress = { ...progress };
    const remember = (patch: Partial<SaveProgress>) => {
      p = { ...p, ...patch };
      setProgress(p);
    };
    try {
      let ruleId = rule?.id ?? p.ruleId;
      const changesKey = JSON.stringify(buildRuleChanges(form));
      if (plan.write === 'create') {
        const input = buildRuleInput(form);
        const out = await create.mutateAsync(input);
        ruleId = out.ruleId;
        remember({ ruleId: out.ruleId, ruleKey: input.ruleKey, writtenKey: changesKey });
        notes.push({ label: 'Luật', text: describeRecompute(out.recompute) });
      } else if (plan.write === 'revise') {
        const out = await revise.mutateAsync({ ruleId: ruleId!, changes: buildRuleChanges(form) });
        remember({ writtenKey: changesKey });
        notes.push({ label: 'Luật', text: describeRecompute(out.recompute) });
      }
      if (plan.activate) {
        const out = await setState.mutateAsync({ ruleId: ruleId!, state: 'active' });
        remember({ activated: true });
        notes.push({ label: 'Kích hoạt', text: describeRecompute(out.recompute) });
      }
      if (plan.price) {
        const out = await setPrice.mutateAsync({ ruleId: ruleId!, deduction: plan.price.value });
        remember({ price: plan.price.value });
        notes.push({ label: 'Giá', text: describeRecompute(out.recompute) });
      }
      setSummaries(notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được luật.');
    } finally {
      setSaving(false);
    }
  }

  const partiallySaved = error !== null && hasWrites(progress);
  const saveLabel =
    plan.write === null && !plan.activate && plan.price !== null ? 'Lưu giá' : saveLabelOf(tier, matchCount);

  const heading = promote ? 'Tạo luật từ lỗi agent báo' : rule ? 'Sửa luật' : 'Tạo luật';
  const orphanKey = form.criterionKey !== '' && !criteria.some((c) => c.key === form.criterionKey);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Vị trí" className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <Link href="/teacher/rules" className="hover:text-foreground">
          Bảng lỗi
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">{heading}</span>
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{heading}</h1>
        {rule && (
          <p className="font-mono text-caption text-muted-foreground">{rule.ruleKey}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
            <legend className="px-1 text-small font-semibold">1. Lỗi là gì</legend>
            <FormField id="rule-name" label="Tên lỗi" error={shown('name')}>
              <Input
                id="rule-name"
                value={form.name}
                invalid={shown('name') !== undefined}
                onChange={(e) => update({ name: e.target.value })}
                onBlur={() => touch('name')}
              />
            </FormField>
            <FormField
              id="rule-description"
              label="Mô tả lỗi"
              error={shown('description')}
              hint="Viết sao cho giảng viên khác và agent hiểu cùng một nghĩa."
            >
              <AutoTextarea
                id="rule-description"
                rows={3}
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
                onBlur={() => touch('description')}
              />
            </FormField>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <legend className="px-1 text-small font-semibold">2. Thuộc tiêu chí nào</legend>
            {criteria.length === 0 && !orphanKey && (
              <p className="text-small text-muted-foreground">
                Chưa có tiêu chí nào — tạo rubric trước ở mục &quot;Trần điểm theo tiêu chí&quot; của trang Bảng lỗi.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {criteria.map((c) => (
                <CriterionPill
                  key={c.key}
                  pressed={form.criterionKey === c.key}
                  title={c.description}
                  onClick={() => {
                    update({ criterionKey: c.key });
                    touch('criterionKey');
                  }}
                >
                  <span className="font-mono">{c.key}</span> · trần {formatVnPoints(c.max)}
                </CriterionPill>
              ))}
              {orphanKey && (
                <CriterionPill pressed warning title="Tiêu chí này không còn trong rubric nào đang dùng" onClick={() => undefined}>
                  <span className="font-mono">{form.criterionKey}</span> · không còn trong rubric
                </CriterionPill>
              )}
            </div>
            {shown('criterionKey') && (
              <p role="alert" className="text-small font-medium text-danger-strong">
                {shown('criterionKey')}
              </p>
            )}
            <p className="text-caption text-muted-foreground">
              Bài chỉ bị trừ tới trần của tiêu chí, không bao giờ âm. Đổi trần ở mục &quot;Trần điểm theo tiêu chí&quot; của
              Bảng lỗi.
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <legend className="px-1 text-small font-semibold">3. Hệ thống nhận ra lỗi này bằng cách nào</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <ModeCard
                pressed={form.mode === 'machine'}
                title="Máy kiểm được"
                text="Chọn một mẫu điều kiện có sẵn, không viết code tự do."
                onClick={() => update({ mode: 'machine' })}
              />
              <ModeCard
                pressed={form.mode === 'words'}
                title="Mô tả bằng lời"
                text="Nguồn gốc Mô hình + công cụ, độ tin tối đa 0,85, góc kiểm soát lại."
                onClick={() => update({ mode: 'words' })}
              />
            </div>

            {form.mode === 'machine' && (
              <div role="radiogroup" aria-label="Mẫu điều kiện" className="flex flex-col gap-2">
                {TEMPLATES.map((t) => {
                  const meta = TEMPLATE_META[t];
                  const selected = form.template === t;
                  // Bậc do server trả cho mẫu đang chọn thắng danh sách mặc định (spec §3.2).
                  const measurable = selected && serverTier !== null ? serverTier === 2 : meta.measurable;
                  return (
                    <label
                      key={t}
                      className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 ${
                        selected ? 'border-accent bg-accent-subtle' : 'border-border'
                      }`}
                    >
                      <span className="flex flex-wrap items-center gap-2 text-small font-semibold">
                        <input
                          type="radio"
                          name="rule-template"
                          checked={selected}
                          onChange={() => update({ template: t, param: '' })}
                        />
                        {meta.label}
                        {!measurable && <Badge variant="info">Máy chưa đo được</Badge>}
                      </span>
                      <span className="text-caption text-muted-foreground">{meta.hint}</span>
                    </label>
                  );
                })}
                {tier === 2 && (
                  <p className="text-small text-muted-foreground">
                    Máy đo được mẫu này: nguồn gốc Máy quyết, độ tin tới 1,0.
                  </p>
                )}
                {tier === 3 && (
                  <Alert variant="info">
                    <AlertDescription>
                      Máy chưa đo được mẫu này: mô hình phán đoán luật này, và tiêu chí chứa nó tính là chưa được kiểm tới
                      — bài dính tiêu chí đó không tự quyết.
                    </AlertDescription>
                  </Alert>
                )}
                {TEMPLATE_META[form.template].param !== 'none' && (
                  <FormField id="rule-param" label={TEMPLATE_META[form.template].paramLabel ?? 'Tham số'} error={shown('param')}>
                    <Input
                      id="rule-param"
                      className="font-mono"
                      value={form.param}
                      invalid={shown('param') !== undefined}
                      placeholder={TEMPLATE_META[form.template].paramPlaceholder}
                      onChange={(e) => update({ param: e.target.value })}
                      onBlur={() => touch('param')}
                    />
                  </FormField>
                )}
              </div>
            )}

            {form.mode === 'words' && (
              <p className="text-small text-muted-foreground">
                Viết dấu hiệu nhận biết vào ô &quot;Mô tả lỗi&quot; ở trên — càng cụ thể, mô hình càng ít nhầm. Luật bằng lời
                áp từ phiên chưa chấm; bài đã chấm không tính lại.
              </p>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <legend className="px-1 text-small font-semibold">4. Mức trừ</legend>
            <FormField
              id="rule-price"
              label="Mức trừ (điểm)"
              error={shown('price')}
              hint="Để trống = chưa có giá: luật vẫn tồn tại, agent vẫn nhận ra lỗi, nhưng bài dính nó không tự quyết được cho tới khi bạn đặt giá."
            >
              <Input
                id="rule-price"
                inputMode="decimal"
                value={form.price}
                invalid={shown('price') !== undefined}
                placeholder="Ví dụ 1,0"
                onChange={(e) => update({ price: e.target.value })}
                onBlur={() => touch('price')}
              />
            </FormField>
          </fieldset>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                <span className="block">{error}</span>
                {partiallySaved && (
                  <span className="mt-1 block">
                    Luật đã được lưu một phần — bấm Lưu để làm nốt phần còn dở, sẽ không tạo lại bước đã xong.
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {summaries && !changed && (
            <Alert variant="success" role="status">
              <AlertDescription>
                <span className="block font-semibold">Đã lưu.</span>
                {summaries.map((s) => (
                  <span key={s.label} className="block">
                    {s.label}: {s.text}
                  </span>
                ))}
                <Link href="/teacher/rules" className="mt-1 inline-block font-semibold underline underline-offset-2">
                  Về Bảng lỗi
                </Link>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-end gap-3">
            {rule && valid && !changed && !summaries && <span className="text-small text-muted-foreground">Chưa đổi gì.</span>}
            <Button asChild variant="outline">
              <Link href="/teacher/rules">Huỷ</Link>
            </Button>
            <Button type="button" disabled={!canSave} loading={saving} onClick={save}>
              {saveLabel}
            </Button>
          </div>
        </div>

        <ApplyPreview tier={tier} state={previewState} />
      </div>
    </div>
  );
}

/** Đã có bước nào được ghi trong phiên làm việc này chưa (để nói "lưu một phần"). */
function hasWrites(progress: SaveProgress): boolean {
  return progress.ruleId !== undefined || progress.writtenKey !== undefined || progress.activated === true;
}

function CriterionPill({
  pressed,
  warning,
  title,
  onClick,
  children,
}: {
  pressed: boolean;
  warning?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-small ${
        pressed
          ? warning
            ? 'border-warning bg-warning-subtle font-semibold text-warning-strong'
            : 'border-accent bg-accent-subtle font-semibold text-accent-strong'
          : 'border-border bg-surface hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}

function ModeCard({ pressed, title, text, onClick }: { pressed: boolean; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-lg border p-3 text-left ${
        pressed ? 'border-accent bg-accent-subtle' : 'border-border hover:bg-surface-2'
      }`}
    >
      <span className="text-small font-semibold">{title}</span>
      <span className="text-caption text-muted-foreground">{text}</span>
    </button>
  );
}
