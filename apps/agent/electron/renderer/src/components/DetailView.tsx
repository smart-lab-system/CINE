/** Group 3 of the mockup — read-only, reachable only via the tray icon.
 *  No confirm/select-file button anywhere, per CLAUDE.md's "minimal"
 *  constraint: this screen only ever displays what SessionController has
 *  already done on its own. */

import { useEffect, useState, type ReactNode } from 'react';
import type { AgentState } from '../../../../src/session-controller';
import { formatClockTime, formatDuration } from '../format';

const CONNECTION_LABEL: Record<AgentState['connection'], string> = {
  idle: 'Chưa kết nối',
  connecting: 'Đang kết nối',
  connected: 'Đang kết nối',
  disconnected: 'Mất kết nối',
  connect_error: 'Không kết nối được',
};

const CONNECTION_TONE_CLASS: Record<AgentState['connection'], string> = {
  idle: 'bg-surface-2 text-muted-foreground',
  connecting: 'bg-warning-subtle text-warning-strong',
  connected: 'bg-success-subtle text-success-strong',
  disconnected: 'bg-danger-subtle text-danger-strong',
  connect_error: 'bg-danger-subtle text-danger-strong',
};

function useRemainingTime(endTime: string | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!endTime) {
      setRemaining(null);
      return;
    }
    const target = new Date(endTime).getTime();
    const tick = (): void => setRemaining(target - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endTime]);
  return remaining;
}

export function DetailView({ state }: { state: AgentState }) {
  const remainingMs = useRemainingTime(state.endTime);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto overflow-x-hidden p-5">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-bold ${CONNECTION_TONE_CLASS[state.connection]}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {CONNECTION_LABEL[state.connection]}
        </span>
        {/* Once exam:finalize has landed, `endTime` is stale by definition
            whenever the teacher closed the session before the scheduled
            time — counting down against it would keep telling the student
            they still have time left after they've already submitted. */}
        {state.examEnded ? (
          <span className="text-caption font-semibold text-muted-foreground">Đã kết thúc</span>
        ) : (
          remainingMs !== null && (
            <span className="text-caption text-muted-foreground">
              Còn <b className="font-mono tabular-nums text-foreground">{formatDuration(remainingMs)}</b>
            </span>
          )
        )}
      </div>

      <div>
        <p className="text-h3 font-bold leading-tight">{state.studentName ?? state.studentId}</p>
        {state.sessionName && <p className="text-small text-muted-foreground">{state.sessionName}</p>}
      </div>

      <Section title="File bắt buộc nộp">
        <div className="flex flex-col gap-1.5">
          {state.requiredFiles.map((file) => (
            <div key={file.filename} className="flex items-start gap-2 text-small">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-caption font-extrabold ${
                  file.created
                    ? 'bg-success-subtle text-success-strong'
                    : 'border border-dashed border-border bg-surface-2 text-muted-foreground'
                }`}
              >
                {file.created ? '✓' : '·'}
              </span>
              {/* break-all, not truncate: required filenames are generated
                  (studentId + name + session code, see workspace-files.ts)
                  and can run well past what any reasonable window width
                  fits on one line — wrapping keeps the full name readable
                  instead of forcing a horizontal scrollbar at any width. */}
              <span className="min-w-0 break-all font-mono text-caption">{file.filename}</span>
              {!file.created && (
                <span className="text-caption text-muted-foreground">
                  {/* `.rar` không có cách nào tạo trước được (xem
                      workspace-files.ts) — `note` nói rõ vì sao, thay vì
                      để sinh viên tưởng đây là một lỗi tạm thời sẽ tự hết. */}
                  — {file.note ?? 'chưa tạo được'}
                </span>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Trạng thái">
        <div className="flex flex-col gap-2 text-caption text-muted-foreground">
          <StatusRow icon="🗂">{materialsSummary(state)}</StatusRow>
          <StatusRow icon="💾">{backupSummary(state)}</StatusRow>
          {/* examEnded, not just finalizing/summary: the rare path where
              handleFinalize's upload throws before ever setting a summary
              must still show something here — silently showing nothing
              would look identical to "exam still running, nothing to
              report yet". */}
          {(state.examEnded || state.submission.finalizing) && (
            <StatusRow icon="📤">{submissionSummary(state)}</StatusRow>
          )}
        </div>
      </Section>

      <Section title="Nhật ký">
        <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {[...state.log]
            .slice(-30)
            .reverse()
            .map((entry, index) => (
              <div key={`${entry.at}-${index}`} className="flex gap-2 text-caption leading-snug">
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{formatClockTime(entry.at)}</span>
                <span className="text-foreground">{entry.message}</span>
              </div>
            ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-caption font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function StatusRow({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 text-center" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

function materialsSummary(state: AgentState): string {
  const m = state.materials;
  if (m.count === 0) {
    return 'Đề thi: không có file đính kèm.';
  }
  switch (m.status) {
    case 'downloaded':
      return `Đề thi: đã tải ${m.downloadedFileNames.length}/${m.count} file.`;
    case 'not-yet':
      return `Đề thi: chưa mở${m.releaseAt ? ` — mở lúc ${formatClockTime(m.releaseAt)}` : ''}.`;
    case 'failed':
      return 'Đề thi: không tải được — hãy báo giám thị.';
    default:
      return 'Đề thi: đang kiểm tra...';
  }
}

function backupSummary(state: AgentState): string {
  const b = state.backup;
  switch (b.status) {
    case 'restoring':
      return 'Sao lưu: đang khôi phục...';
    case 'restored':
      return `Sao lưu: đã khôi phục ${b.restoredCount} file.`;
    case 'failed':
      return 'Sao lưu: không khôi phục được.';
    default:
      return b.lastSnapshotAt
        ? `Sao lưu: lần gần nhất ${formatClockTime(b.lastSnapshotAt)}.`
        : 'Sao lưu: sẽ tự động vài phút một lần.';
  }
}

function submissionSummary(state: AgentState): string {
  if (state.submission.finalizing) {
    return 'Đang nộp bài...';
  }
  const summary = state.submission.summary;
  if (!summary) {
    // examEnded but no summary: handleFinalize's own catch branch, or its
    // "no required-deliverable list yet" guard — either way the exam is
    // over and nothing got uploaded, which is worth surfacing loudly
    // rather than leaving this row silently blank.
    return state.examEnded ? 'Đã hết giờ làm bài nhưng có lỗi khi nộp — hãy báo giám thị ngay.' : '';
  }
  const parts = [`Đã nộp ${summary.uploaded}/${summary.total} file`];
  if (summary.missing > 0) parts.push(`${summary.missing} thiếu`);
  if (summary.failed > 0) parts.push(`${summary.failed} lỗi`);
  return parts.join(', ') + '.';
}
