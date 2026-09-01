/** State c — shown for a few seconds right after a successful join
 *  (App.tsx owns the timer), then the window auto-minimizes and any
 *  later reopen shows DetailView instead. This *is* the attendance
 *  confirmation — `agent:join` already wrote it server-side. */

import type { AgentState } from '../../../../src/session-controller';
import { StatusLine } from './ui';
import { formatClockTime } from '../format';

export function ConfirmedBadge({ state }: { state: AgentState }) {
  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex flex-col items-center gap-2 py-1 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-2xl text-success-strong">
          ✓
        </div>
        <span className="text-body font-bold">{state.studentName ?? state.studentId}</span>
        {state.sessionName && <span className="text-small text-muted-foreground">{state.sessionName}</span>}
        <span className="mt-0.5 rounded-full bg-success-subtle px-2.5 py-1 text-caption font-semibold text-success-strong">
          Đã điểm danh lúc {formatClockTime(state.confirmedAt)}
        </span>
      </div>
      <StatusLine tone="info">Không phải bạn? Thoát ngay và báo giám thị trước khi tiếp tục.</StatusLine>
      <p className="text-center text-caption text-muted-foreground">
        ↓ Cửa sổ sẽ tự thu vào khay hệ thống trong giây lát
      </p>
    </div>
  );
}
