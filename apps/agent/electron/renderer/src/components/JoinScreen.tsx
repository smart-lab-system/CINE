/**
 * States a, b, d, d2, e, f, g of the design spec's §4 table, plus group
 * 1b's connect_error — every screen that exists before `agent:join`
 * actually succeeds. 'joined' is handled by App.tsx, not here: this
 * component never renders once that happens.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { AgentState } from '../../../../src/session-controller';
import { AppButton, BrandMark, Field, Spinner, StatusLine } from './ui';

// Client-side conveniences only (design spec §5.1) — the server DTOs are
// the actual enforcement. General alphanumeric, not the narrower
// confusable-free alphabet new codes are generated from: an old session
// created before that change may still have an O/I/0/1 in its code, and
// this field must still accept it.
const MSSV_MAX = 20;
const CODE_LENGTH = 6;
const NON_ALPHANUMERIC = /[^A-Za-z0-9]/g;

function sanitizeMssv(raw: string): string {
  return raw.replace(NON_ALPHANUMERIC, '').slice(0, MSSV_MAX);
}

function sanitizeCode(raw: string): string {
  return raw.replace(NON_ALPHANUMERIC, '').toUpperCase().slice(0, CODE_LENGTH);
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Ticks once a second while `retryUntil` is in the future; null once it
 *  isn't (or there is none), so the caller can tell "still counting" from
 *  "done, safe to let the student try again". */
function useCountdown(retryUntil: string | undefined): number | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!retryUntil) {
      setRemainingMs(null);
      return;
    }
    const target = new Date(retryUntil).getTime();
    const tick = (): void => {
      const remaining = target - Date.now();
      setRemainingMs(remaining > 0 ? remaining : null);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);

  return remainingMs;
}

export function JoinScreen({ state }: { state: AgentState }) {
  const [studentId, setStudentId] = useState(state.studentId ?? '');
  const [sessionCode, setSessionCode] = useState(state.sessionCode ?? '');
  const remainingMs = useCountdown(state.joinPhase === 'rate_limited' ? state.joinError?.retryUntil : undefined);
  const locked = state.joinPhase === 'rate_limited' && remainingMs !== null;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    window.agent.join({ studentId, sessionCode });
  };

  if (state.joinPhase === 'access_request_form') {
    return <AccessRequestForm studentId={studentId} />;
  }
  if (state.joinPhase === 'access_request_pending') {
    return (
      <Centered>
        <Spinner />
        <p className="mt-1.5 text-small font-semibold">Đã gửi yêu cầu</p>
        <p className="max-w-[26ch] text-caption text-muted-foreground">
          Đang chờ giảng viên duyệt. Đừng tắt cửa sổ này — nếu chờ quá lâu, báo trực tiếp giám thị trong phòng.
        </p>
      </Centered>
    );
  }
  if (state.joinPhase === 'joining') {
    return (
      <Centered>
        <Spinner />
        <p className="mt-1.5 text-small font-semibold">Đang xác nhận với máy chủ…</p>
        <p className="text-caption text-muted-foreground">
          {studentId} · phiên {sessionCode}
        </p>
      </Centered>
    );
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col gap-4 p-5">
      <BrandMark />
      <h1 className="-mb-1 text-h2 font-bold">Vào phòng thi</h1>

      {state.joinPhase === 'form' && (
        <p className="-mt-2 text-small text-muted-foreground">Nhập đúng 2 thông tin giảng viên đã đọc cho bạn.</p>
      )}
      {state.joinPhase === 'connect_error' && (
        <StatusLine tone="danger">
          <b>Không kết nối được máy chủ.</b>
          <br />
          Hệ thống không thể tự báo giám thị trong tình huống này — vui lòng đứng lên và báo trực tiếp.
        </StatusLine>
      )}
      {(state.joinPhase === 'error' || state.joinPhase === 'rate_limited' || state.joinPhase === 'session_not_active') &&
        state.joinError && <ErrorBanner joinPhase={state.joinPhase} error={state.joinError} remainingMs={remainingMs} />}

      <Field
        label="Mã số sinh viên (MSSV)"
        value={studentId}
        onChange={(e) => setStudentId(sanitizeMssv(e.target.value))}
        placeholder="VD: SV20120001"
        hint="4-20 ký tự chữ và số, không dấu cách."
        disabled={locked}
        invalid={state.joinPhase === 'error' && state.joinError?.code !== 'SESSION_NOT_FOUND'}
        autoFocus
      />
      <Field
        label="Mã phiên thi"
        value={sessionCode}
        onChange={(e) => setSessionCode(sanitizeCode(e.target.value))}
        placeholder="VD: Q7X4KD"
        hint="Giảng viên đọc mã này khi mở phiên thi · tự động viết hoa, đúng 6 ký tự."
        disabled={locked}
        invalid={state.joinPhase === 'error' && state.joinError?.code === 'SESSION_NOT_FOUND'}
      />

      <div className="mt-auto">
        <AppButton type="submit" disabled={locked || studentId.length < 4 || sessionCode.length < CODE_LENGTH}>
          {submitLabel(state.joinPhase, remainingMs)}
        </AppButton>
      </div>
    </form>
  );
}

function submitLabel(joinPhase: AgentState['joinPhase'], remainingMs: number | null): string {
  if (joinPhase === 'rate_limited' && remainingMs !== null) {
    return `Thử lại sau ${formatCountdown(remainingMs)}`;
  }
  if (joinPhase === 'form') {
    return 'Xác nhận vào thi';
  }
  if (joinPhase === 'connect_error') {
    return 'Thử kết nối lại';
  }
  return 'Thử lại';
}

function ErrorBanner({
  joinPhase,
  error,
  remainingMs,
}: {
  joinPhase: AgentState['joinPhase'];
  error: NonNullable<AgentState['joinError']>;
  remainingMs: number | null;
}) {
  if (joinPhase === 'rate_limited') {
    return (
      <StatusLine tone="warning">
        <b>Tạm khoá do nhập sai nhiều lần.</b>
        <br />
        {remainingMs !== null
          ? `Thử lại sau ${formatCountdown(remainingMs)} — lần khoá sau sẽ lâu hơn nếu tiếp tục sai.`
          : 'Có thể thử lại ngay bây giờ.'}
      </StatusLine>
    );
  }
  if (joinPhase === 'session_not_active') {
    return (
      <StatusLine tone="warning">
        <b>Phiên thi chưa tới giờ bắt đầu hoặc đã kết thúc.</b>
        <br />
        {error.message}
      </StatusLine>
    );
  }
  const label = error.code === 'SESSION_NOT_FOUND' ? 'Không tìm thấy phiên thi.' : 'Sai thông tin.';
  return (
    <StatusLine tone="danger">
      <b>{label}</b>
      <br />
      {error.message}
    </StatusLine>
  );
}

function AccessRequestForm({ studentId }: { studentId: string }) {
  const [fullName, setFullName] = useState('');
  const [reason, setReason] = useState('');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    window.agent.sendAccessRequest({ fullName: fullName.trim(), reason: reason.trim() });
  };

  return (
    <form onSubmit={submit} className="flex h-full flex-col gap-4 p-5">
      <BrandMark />
      <h1 className="-mb-1 text-h2 font-bold">Gửi yêu cầu vào thi</h1>
      <p className="-mt-2 text-small text-muted-foreground">
        MSSV {studentId} chưa có trong danh sách lớp. Giảng viên sẽ duyệt trực tiếp.
      </p>
      <Field label="Họ và tên" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
      <Field
        label="Lý do"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="VD: thi bù, chuyển từ nhóm khác"
      />
      <div className="mt-auto">
        <AppButton type="submit" disabled={fullName.trim().length === 0 || reason.trim().length === 0}>
          Gửi yêu cầu
        </AppButton>
      </div>
    </form>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-5 text-center">{children}</div>
  );
}
