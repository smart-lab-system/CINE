'use client';

import Link from 'next/link';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { TestBundleCase, TestBundleView } from '@/lib/api/grading';

const ORIGIN_TEXT: Record<TestBundleView['origin'], string> = {
  teacher: 'bạn tải lên',
  from_model_answer: 'sinh từ đáp án mẫu của đề',
  generated: 'hệ thống sinh từ đề',
};

const CASE_CHIP: Record<TestBundleCase['status'], { label: string; variant: BadgeProps['variant'] }> = {
  pass: { label: 'Đạt', variant: 'success' },
  fail: { label: 'Không đạt', variant: 'destructive' },
  timeout: { label: 'Hết giờ', variant: 'warning' },
  error: { label: 'Lỗi', variant: 'destructive' },
  not_run: { label: 'Chưa chạy', variant: 'outline' },
};

const isFailing = (status: TestBundleCase['status']) => status === 'fail' || status === 'timeout' || status === 'error';

/**
 * Gói test ↔ quy tắc trừ điểm (§5.8c): ca nào trong gói nào chạy lỗi, và nó là bằng chứng cho quy tắc nào. Nói thẳng
 * ba trạng thái: ca không đạt chưa thuộc quy tắc nào, quy tắc chưa đo được, và ca chưa chạy (không có nghĩa là đạt).
 */
export function TestBundleMap({ bundle, rulesHref }: { bundle: TestBundleView; rulesHref?: string }) {
  const anyNotRun = bundle.groups.some((g) => g.cases.some((c) => c.status === 'not_run'));

  return (
    <section aria-label="Gói test và quy tắc trừ điểm" className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
      <h3 className="section-label">Gói test</h3>
      <p className="text-small text-muted-foreground">
        Gói v{bundle.version} · {ORIGIN_TEXT[bundle.origin]}
        {bundle.filename ? ` (${bundle.filename})` : ''} · {bundle.approved ? 'đã duyệt' : 'chưa duyệt'} · {bundle.caseCount} ca ·{' '}
        {bundle.groups.length} nhóm
        {bundle.droppedCount > 0 ? ` · ${bundle.droppedCount} ca bị hệ thống tự bỏ` : ''}
      </p>

      {bundle.groups.map((g) => {
        const failingCount = g.cases.filter((c) => isFailing(c.status)).length;
        const groupRuleKeys = g.rules.map((r) => r.ruleKey);
        return (
          <div key={g.group} className="flex flex-col gap-2 border-t border-border pt-2">
            <p className="font-medium">
              Nhóm “{g.group}”: {failingCount} ca không đạt
            </p>
            {g.rules.length > 0 ? (
              <p className="text-caption text-muted-foreground">
                Quy tắc dùng nhóm này:{' '}
                {g.rules.map((r) => `${r.ruleKey} (${r.triggered ? 'đang trừ điểm' : 'chưa kích hoạt'})`).join(', ')}
              </p>
            ) : (
              failingCount > 0 && <p className="text-caption text-warning-strong">Nhóm này chưa có quy tắc nào dùng nó.</p>
            )}
            <ul className="flex flex-col gap-1.5">
              {g.cases.map((c) => (
                <CaseRow
                  key={c.caseKey}
                  c={c}
                  evidenceFor={isFailing(c.status) ? groupRuleKeys : []}
                />
              ))}
            </ul>
          </div>
        );
      })}

      {bundle.uncoveredFailingCases.length > 0 && (
        <p className="text-small text-warning-strong">
          Ca không đạt chưa thuộc quy tắc nào: {bundle.uncoveredFailingCases.join(', ')}. Các ca này không bị trừ điểm.{' '}
          {rulesHref && (
            <Link href={rulesHref} className="font-medium underline underline-offset-2">
              Thêm quy tắc cho nhóm
            </Link>
          )}
        </p>
      )}

      {bundle.unmeasuredRules.map((r) => (
        <p key={r.ruleId} className="text-small text-muted-foreground">
          Chưa đo được: <span className="font-medium text-foreground">{r.ruleKey}</span> dùng nhóm “{r.group}”, mà gói này không
          có nhóm đó. Không trừ điểm, và không có nghĩa là đạt.
        </p>
      ))}

      {anyNotRun && <p className="text-caption text-muted-foreground">Chưa chạy không có nghĩa là đạt.</p>}
    </section>
  );
}

function CaseRow({ c, evidenceFor }: { c: TestBundleCase; evidenceFor: string[] }) {
  const chip = CASE_CHIP[c.status];
  return (
    <li className="flex flex-col gap-1 rounded-md border border-border p-2 text-small">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={chip.variant}>{chip.label}</Badge>
        <span className="font-medium">{c.caseKey}</span>
        {evidenceFor.length > 0 && (
          <span className="text-caption text-muted-foreground">bằng chứng cho {evidenceFor.join(', ')}</span>
        )}
        {c.ms !== null && <span className="ml-auto text-caption text-muted-foreground">{c.ms} ms</span>}
      </div>
      {c.constraintQuote && <p className="text-caption text-muted-foreground">Đề yêu cầu: “{c.constraintQuote}”</p>}
      <details>
        <summary className="cursor-pointer text-caption text-accent-strong">Dữ liệu vào, đáp án, bài làm</summary>
        <div className="mt-1 flex flex-col gap-1">
          <pre className="overflow-x-auto rounded bg-muted p-1.5 font-mono text-caption">Vào: {c.input}</pre>
          <pre className="overflow-x-auto rounded bg-muted p-1.5 font-mono text-caption">Đáp án: {c.expectedOutput}</pre>
          {c.diff && <pre className="overflow-x-auto rounded bg-muted p-1.5 font-mono text-caption">{c.diff.slice(0, 400)}</pre>}
        </div>
      </details>
    </li>
  );
}
