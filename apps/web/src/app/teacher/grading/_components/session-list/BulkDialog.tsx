'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SESSION_SUMMARIES_KEY, useRubrics } from '@/hooks/useGrading';
import { setSessionRubric, startGrading } from '@/lib/api/grading';
import { submittedCount, type SessionRow } from '@/lib/session-list';
import { runSequentially, type BulkOutcome } from '@/lib/session-list-bulk';

export interface BulkRequest {
  kind: 'start' | 'rubric';
  rows: SessionRow[];
  /** Số phiên đã chọn nhưng không đủ điều kiện cho thao tác này, nên bị bỏ qua. */
  skipped: number;
}

type Phase = 'confirm' | 'running' | 'done';

function RubricPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const rubrics = useRubrics();
  const options = useMemo(
    () => (rubrics.data ?? []).filter((r) => r.isActive).sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.version - b.version),
    [rubrics.data],
  );
  useEffect(() => {
    if (!value && options[0]) onChange(options[0].id);
  }, [options, value, onChange]);

  if (rubrics.isLoading) return <p className="text-small text-muted-foreground">Đang tải rubric…</p>;
  if (options.length === 0) return <p className="text-small text-muted-foreground">Chưa có rubric nào. Tạo rubric ở trang Bảng lỗi trước.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="bulk-rubric" className="text-caption font-semibold text-muted-foreground">Rubric</label>
      <select id="bulk-rubric" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-md border border-input bg-surface px-3 text-body">
        {options.map((r) => (
          <option key={r.id} value={r.id}>{`${r.name} · v${r.version}`}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * Hộp xác nhận + kết quả cho thao tác hàng loạt. Chạy TUẦN TỰ từng phiên qua chính các route theo-phiên
 * (`start-grading`, `PATCH rubric`) — máy chủ vẫn là người quyết phiên nào được bắt đầu (spec mục 1.1, 5).
 * Bắt đầu chấm luôn có bước xác nhận này: đây là thao tác tường minh của giảng viên mà CLAUDE.md đòi.
 */
export function BulkDialog({ request, onClose, onFinished }: { request: BulkRequest; onClose: () => void; onFinished: () => void }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('confirm');
  const [outcomes, setOutcomes] = useState<BulkOutcome[]>([]);
  const [rubricId, setRubricId] = useState('');

  const { kind, rows, skipped } = request;
  const totalPapers = rows.reduce((sum, r) => sum + submittedCount(r.session), 0);
  const nameOf = (id: string) => rows.find((r) => r.session.id === id)?.session.name ?? id;
  const ok = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - ok;

  async function run() {
    setPhase('running');
    const ids = rows.map((r) => r.session.id);
    const result = await runSequentially(ids, kind === 'start' ? (id) => startGrading(id) : (id) => setSessionRubric(id, rubricId));
    setOutcomes(result);
    setPhase('done');
    // Trạng thái và rubric của các phiên vừa đổi: đọc lại cả hai nguồn của danh sách.
    void queryClient.invalidateQueries({ queryKey: SESSION_SUMMARIES_KEY });
    void queryClient.invalidateQueries({ queryKey: ['submissions', 'overview'] });
  }

  const title =
    phase === 'done'
      ? kind === 'start'
        ? `Đã bắt đầu ${ok} phiên${failed ? `, ${failed} phiên bị từ chối` : ''}`
        : `Đã gắn rubric cho ${ok} phiên${failed ? `, ${failed} phiên bị từ chối` : ''}`
      : kind === 'start'
        ? `Bắt đầu chấm ${rows.length} phiên?`
        : `Gắn rubric cho ${rows.length} phiên`;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && phase !== 'running') (phase === 'done' ? onFinished : onClose)(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {phase === 'confirm' && kind === 'start' && (
            <DialogDescription>
              Hệ thống sẽ xếp <b>{totalPapers} bài</b> của <b>{rows.length} phiên</b> vào hàng đợi chấm. Bạn vẫn xem và sửa được từng kết quả sau đó.
            </DialogDescription>
          )}
          {phase === 'confirm' && kind === 'rubric' && (
            <DialogDescription>Chỉ áp dụng cho phiên chưa chấm. Sau khi phiên có kết quả đầu tiên, rubric của phiên không đổi được.</DialogDescription>
          )}
        </DialogHeader>

        {phase === 'confirm' && kind === 'rubric' && <RubricPicker value={rubricId} onChange={setRubricId} />}

        {phase !== 'done' ? (
          <ul className="max-h-56 divide-y divide-border overflow-auto rounded-lg border border-border text-small">
            {rows.map((r) => (
              <li key={r.session.id} className="flex justify-between gap-3 px-3 py-2">
                <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{r.session.name}</span>
                <span className="whitespace-nowrap tabular-nums text-muted-foreground">{r.session.className} · {submittedCount(r.session)} bài</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="max-h-64 divide-y divide-border overflow-auto rounded-lg border border-border text-small">
            {outcomes.map((o) => (
              <li key={o.sessionId} className="flex items-start gap-2 px-3 py-2">
                {o.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-strong" aria-label="Thành công" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger-strong" aria-label="Bị từ chối" />}
                <span className="min-w-0">
                  <span className="block font-semibold [overflow-wrap:anywhere]">{nameOf(o.sessionId)}</span>
                  {!o.ok && <span className="block text-muted-foreground">{o.message}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {phase === 'confirm' && kind === 'start' && (
          <p className="text-small text-muted-foreground">
            Danh sách chỉ kiểm rubric và đề bài. Gói test của bài code và các điều kiện khác do máy chủ kiểm; phiên nào bị từ chối sẽ báo lại lý do.
          </p>
        )}
        {phase === 'confirm' && skipped > 0 && (
          <p className="text-small text-muted-foreground">
            {skipped} phiên đã chọn không đủ điều kiện {kind === 'start' ? 'bắt đầu chấm' : 'cần gắn rubric'} nên được bỏ qua.
          </p>
        )}
        {phase === 'running' && <p role="status" className="text-small text-muted-foreground">Đang xử lý từng phiên…</p>}

        <DialogFooter>
          {phase === 'confirm' && (
            <>
              <Button type="button" variant="outline" onClick={onClose}>Huỷ</Button>
              <Button type="button" onClick={() => void run()} disabled={kind === 'rubric' && !rubricId}>
                {kind === 'start' ? `Bắt đầu chấm ${rows.length} phiên` : `Gắn cho ${rows.length} phiên`}
              </Button>
            </>
          )}
          {phase === 'done' && <Button type="button" onClick={onFinished}>Đóng</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
