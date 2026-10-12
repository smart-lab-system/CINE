'use client';

import { useState } from 'react';
import { Ban, Check, CircleAlert, CircleDashed, Copy, Download, Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePreviewExport, useWriteExport } from '@/hooks/useGradeExport';
import type { PlanResponse, PlanRowView, RoundingStep, RowAction } from '@/lib/api/grade-export';
import {
  ACTION_LABEL, ROUNDING_OPTIONS, ROW_FILTER_LABEL, blankReportCsv, blankReportFilename, canWriteNow, causeTallyText, countFilters,
  directionText, hasBlankReport, matchesFilter, scoreText, type PlanBase, type RowFilter,
} from '@/lib/grade-export-view';

const SHOWN_ROWS = 300;
const ACTION_ICON: Record<RowAction, typeof Check> = {
  write: Check, blank: CircleDashed, kept: Lock, unmatched: CircleAlert, duplicate: Copy, skipped_formula: Ban, skipped_merged: Ban,
};

function downloadCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Bước 3 (spec §3.6): chọn làm tròn (KHÔNG chọn sẵn; được ghi vào bản ghi lượt xuất), xem ba con số và từng dòng, rồi
 * ghi. Không có bản xem trước nào được yêu cầu cho tới khi chọn làm tròn — bản xem trước phụ thuộc vào nó. Nút ghi tắt
 * và GHI RA lý do; ghi đè và điểm giảm mỗi cái cần một dấu tick riêng nói rõ con số.
 */
export function StepPreview({
  sessionId,
  sessionName,
  sessionCode,
  templateFileName,
  request,
  onBack,
}: {
  sessionId: string;
  sessionName: string;
  sessionCode: string;
  templateFileName: string;
  request: PlanBase;
  onBack: () => void;
}) {
  const preview = usePreviewExport(sessionId);
  const write = useWriteExport(sessionId);
  const [step, setStep] = useState<RoundingStep | null>(null);
  const [overwriteAck, setOverwriteAck] = useState(false);
  const [decreaseAck, setDecreaseAck] = useState(false);
  const [filter, setFilter] = useState<RowFilter>('all');
  const plan: PlanResponse | null = preview.data ?? null;

  const overwriteCount = plan ? plan.overwrite.score + plan.overwrite.reason : 0;
  const overwriteNeeded = overwriteCount > 0;
  const down = plan?.changes?.down ?? 0;
  const gate = canWriteNow({ plan, roundingStep: step, overwriteAck, decreaseAck });
  const counts = plan ? countFilters(plan.rows) : null;
  const visible = plan ? plan.rows.filter((r) => matchesFilter(r, filter)) : [];

  function loadPreview(value: RoundingStep) {
    setOverwriteAck(false);
    setDecreaseAck(false);
    write.reset();
    preview.mutate({ ...request, roundingStepHundredths: value });
  }
  function choose(value: RoundingStep) {
    setStep(value);
    loadPreview(value);
  }
  function submit() {
    if (!plan || step === null) return;
    write.mutate({
      ...request,
      roundingStepHundredths: step,
      expectedDigest: plan.digest,
      templateFileName,
      ...(overwriteNeeded ? { overwriteExisting: true } : {}),
      ...(down > 0 ? { confirmDecreases: true } : {}),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <legend className="px-1 text-small font-semibold">Làm tròn điểm khi ghi</legend>
        <div role="radiogroup" aria-label="Làm tròn điểm khi ghi" className="flex flex-wrap gap-4">
          {ROUNDING_OPTIONS.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 text-small">
              <input type="radio" name="gx-rounding" checked={step === option.value} onChange={() => choose(option.value)} disabled={write.isPending} />
              {option.label}
            </label>
          ))}
        </div>
        <p className="text-caption text-muted-foreground">
          Làm tròn nửa lên (ví dụ 7,25 → 7,3 ở bước 0,1). Chỉ làm tròn lúc ghi ra file; cách làm tròn được ghi vào bản ghi lượt xuất.
        </p>
      </fieldset>

      {preview.isPending && <p className="text-small text-muted-foreground">Đang tính bản xem trước…</p>}
      {preview.error && !write.error && (
        <Alert variant="destructive">
          <AlertDescription>{preview.error.message}</AlertDescription>
        </Alert>
      )}

      {plan && (
        <>
          {plan.blockers.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {plan.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <ul aria-label="Ba con số" className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Sẽ ghi', value: plan.summary.write },
              { label: 'Để trống', value: plan.summary.blank + plan.summary.kept },
              { label: 'Không khớp', value: plan.summary.unmatched },
            ].map((n) => (
              <li key={n.label} className="rounded-lg border border-border bg-surface p-4">
                <p className="text-caption text-muted-foreground">{n.label}</p>
                <p className="text-h1 tabular-nums">{n.value}</p>
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted-foreground">
            {[
              plan.summary.kept > 0 && `${plan.summary.kept} ô giữ nguyên (đã ghi lần trước, nay bài chưa xong)`,
              plan.summary.duplicates > 0 && `${plan.summary.duplicates} dòng MSSV trùng`,
              plan.summary.skipped > 0 && `${plan.summary.skipped} dòng bị bỏ qua (ô có công thức hoặc ô gộp)`,
              plan.summary.ignoredEmpty > 0 && `${plan.summary.ignoredEmpty} dòng không có MSSV`,
              plan.summary.notInFile > 0 && `${plan.summary.notInFile} sinh viên chưa có dòng trong file`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {plan.notInFile.length > 0 && (
            <details role="group" aria-label={`Sinh viên có trong phiên nhưng chưa có dòng trong file (${plan.notInFile.length})`} className="rounded-lg border border-border bg-surface p-3 text-small">
              <summary className="cursor-pointer font-semibold">Sinh viên có trong phiên nhưng chưa có dòng trong file ({plan.notInFile.length})</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {plan.notInFile.map((s) => (
                  <li key={s.mssv}>
                    <span className="font-mono">{s.mssv}</span> {s.name} — {s.score !== null ? scoreText(s.score) : s.blankLabel}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-caption text-muted-foreground">Hệ thống không thêm dòng vào file của bạn. Nếu cần, thêm dòng trong Excel rồi xuất lại.</p>
            </details>
          )}

          {plan.changes && (
            <section aria-label="So với lần ghi trước" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-small">
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold">
                <span>↓ {plan.changes.down} bài giảm</span>
                <span>↑ {plan.changes.up} bài tăng</span>
                <span className="font-normal text-muted-foreground">{plan.changes.same} bài không đổi</span>
                {plan.changes.new > 0 && <span className="font-normal text-muted-foreground">{plan.changes.new} bài mới</span>}
              </p>
              <p className="text-caption text-muted-foreground">So theo giá trị đã làm tròn, với lần ghi trước của cùng phiên.</p>
              {plan.changes.downByCause.length > 0 && (
                <p>Giảm do: {plan.changes.downByCause.map(causeTallyText).join(', ')}</p>
              )}
              {plan.changes.upByCause.length > 0 && (
                <p>Tăng do: {plan.changes.upByCause.map(causeTallyText).join(', ')}</p>
              )}
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            {(Object.keys(ROW_FILTER_LABEL) as RowFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1.5 text-small ${filter === f ? 'border-accent bg-accent-subtle font-semibold text-accent-strong' : 'border-border bg-surface hover:bg-surface-2'}`}
              >
                {ROW_FILTER_LABEL[f]} · {counts![f]}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <Table aria-label="Từng dòng của file">
              <TableHeader>
                <TableRow>
                  <TableHead>Dòng</TableHead>
                  <TableHead>MSSV</TableHead>
                  <TableHead>Họ tên</TableHead>
                  <TableHead className="text-right">Điểm hệ thống</TableHead>
                  <TableHead>Giá trị sẽ ghi</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.slice(0, SHOWN_ROWS).map((r) => (
                  <PlanRowLine key={r.row} r={r} />
                ))}
              </TableBody>
            </Table>
          </div>
          {visible.length > SHOWN_ROWS && <p className="text-caption text-muted-foreground">Đang hiện {SHOWN_ROWS}/{visible.length} dòng — dùng bộ lọc để xem phần còn lại.</p>}

          {overwriteNeeded && (
            <label className="flex cursor-pointer items-start gap-2 text-small">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={overwriteAck} onChange={(e) => setOverwriteAck(e.target.checked)} />
              <span>Tôi đồng ý ghi đè {overwriteCount} ô đã có giá trị</span>
            </label>
          )}
          {down > 0 && (
            <label className="flex cursor-pointer items-start gap-2 text-small">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={decreaseAck} onChange={(e) => setDecreaseAck(e.target.checked)} />
              <span>Tôi đã xem {down} bài bị giảm điểm và đồng ý ghi</span>
            </label>
          )}
        </>
      )}

      {write.error && (
        <Alert variant="destructive">
          <AlertDescription>{write.error.message}</AlertDescription>
        </Alert>
      )}

      {write.data ? (
        <div className="flex flex-col gap-3">
          <Alert variant="success" role="status">
            <AlertDescription>
              Đã ghi {write.data.summary.written} điểm vào file. {write.data.summary.blank + write.data.summary.kept} ô để trống
              {write.data.summary.kept > 0 ? ` (${write.data.summary.kept} ô giữ nguyên)` : ''}, {write.data.summary.unmatched} dòng không khớp
              {write.data.summary.decreased > 0 ? `; ${write.data.summary.decreased} bài giảm điểm đã được bạn xác nhận` : ''}.
            </AlertDescription>
          </Alert>
          <Button asChild className="self-start">
            <a href={write.data.downloadUrl} rel="noopener">
              <Download className="h-4 w-4" aria-hidden="true" />
              Tải file đã ghi ({write.data.fileName})
            </a>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={onBack} disabled={write.isPending}>
              Quay lại chọn cột
            </Button>
            {plan && hasBlankReport(plan) && (
              <Button type="button" variant="outline" onClick={() => downloadCsv(blankReportCsv(plan), blankReportFilename(sessionName, sessionCode))}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Tải bảng kê ô trống (CSV)
              </Button>
            )}
            {write.error && step !== null && (
              <Button type="button" variant="outline" onClick={() => loadPreview(step)}>
                Xem trước lại
              </Button>
            )}
            <Button type="button" loading={write.isPending} disabled={!gate.enabled} onClick={submit}>
              Ghi vào file
            </Button>
          </div>
          {!gate.enabled && (
            <ul className="flex flex-col gap-0.5 text-caption text-muted-foreground">
              {gate.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PlanRowLine({ r }: { r: PlanRowView }) {
  const Icon = ACTION_ICON[r.action];
  const change = directionText(r);
  return (
    <TableRow>
      <TableCell className="tabular-nums">{r.row}</TableCell>
      <TableCell className="font-mono">{r.studentMssv ?? r.mssvInFile}</TableCell>
      <TableCell>{r.studentName ?? '—'}</TableCell>
      <TableCell className="text-right tabular-nums">{scoreText(r.systemScore)}</TableCell>
      <TableCell>
        {r.action === 'write' ? (
          <span className="flex items-center gap-1.5 font-semibold tabular-nums">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {scoreText(r.writtenScore)}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {ACTION_LABEL[r.action]}
          </span>
        )}
      </TableCell>
      <TableCell className="max-w-[360px] text-small text-muted-foreground">
        {r.blankLabel && <span className="block">{r.blankLabel}</span>}
        {change && <span className="block">{change}</span>}
        {r.note && <span className="block">{r.note}</span>}
      </TableCell>
    </TableRow>
  );
}
