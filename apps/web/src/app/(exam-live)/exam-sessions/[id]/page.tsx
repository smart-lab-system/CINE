'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { socket } from '@/lib/socket';
import { useExamSessionDetail } from '@/hooks/useExamSession';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getDisplaySessionStatus } from '@/lib/exam-session-display';
import { LobbyList, type LobbyStudent } from './_components/LobbyList';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Server -> Client payloads, per the WebSocket Event Contract
// (apps/api/src/exam-session/exam-session.gateway.ts). Kept local to this
// page rather than in `lib/socket.ts` — this page is the only consumer.
interface LobbyStudentJoinedPayload {
  studentId: string;
  fullName: string;
  joinedAt: string;
}

interface AgentDisconnectedPayload {
  studentId: string;
  disconnectedAt: string;
}

type TeacherSubscribeErrorCode = 'UNAUTHORIZED' | 'SESSION_NOT_FOUND' | 'FORBIDDEN';

interface TeacherSubscribeErrorPayload {
  code: TeacherSubscribeErrorCode;
  message: string;
}

// Vietnamese copy per error code — added to the contract after Task 3
// found `teacher:subscribe` had no failure path (see the gateway's
// `emitSubscribeError`). Falls back to the server's own `message` for any
// code this map doesn't recognize, so a future 4th code still renders
// something instead of `undefined`.
const SUBSCRIBE_ERROR_MESSAGES: Record<TeacherSubscribeErrorCode, string> = {
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
  SESSION_NOT_FOUND: 'Không tìm thấy phiên thi này.',
  FORBIDDEN: 'Bạn không phải là chủ của phiên thi này.',
};

/**
 * The projector-facing lobby. Deliberately outside the admin/teacher app
 * shell (its own route group, no sidebar) and deliberately outside
 * PageTransition: this screen is watched live while an exam starts, so
 * rows appear the instant the server says so. Nothing here staggers,
 * fades, or animates on update — see the design spec's "do not animate"
 * list. The only motion is the standing "live" pulse, which reports that
 * the socket is open rather than reacting to any particular event.
 */
export default function ExamSessionLobbyPage() {
  const params = useParams<{ id: string }>();
  const examSessionId = params.id;

  // Read-only metadata (name/start/end/status) via REST — separate from
  // the live roster below, which only ever comes from the WebSocket.
  // `agent:join` already independently re-derives the real time window
  // server-side (ExamSessionGateway — a stale/forever-'active' status
  // column can never let a late agent actually join), but this page had
  // no way to tell the *teacher* the session was over, so a lobby for an
  // exam that ended yesterday looked identical to a live one waiting for
  // students — reported directly against the live app.
  const sessionDetail = useExamSessionDetail(examSessionId);
  const displayStatus = sessionDetail.data
    ? getDisplaySessionStatus(
        sessionDetail.data.status,
        sessionDetail.data.startTime,
        sessionDetail.data.endTime,
      )
    : null;

  const [students, setStudents] = useState<LobbyStudent[]>([]);
  const [subscribeError, setSubscribeError] = useState<TeacherSubscribeErrorPayload | null>(
    null,
  );

  useEffect(() => {
    if (!examSessionId) {
      return;
    }

    // Reset error state on a fresh subscribe attempt — otherwise
    // navigating from a bad session id straight to a valid one would keep
    // showing the previous error forever (subscribing successfully never
    // emits any "ok" event to clear it).
    setSubscribeError(null);
    setStudents([]);

    // `teacher:subscribe` only joins a socket.io room — there is no
    // `teacher:unsubscribe` in the contract. Re-emitting on every
    // `connect` (not just the first) is required, not optional: if this
    // connection ever drops and socket.io-client's built-in reconnection
    // reconnects it, that is a brand-new server-side socket with no room
    // membership, so the subscription must be redone or this page would
    // silently stop receiving events after any network blip.
    function handleConnect() {
      socket.emit('teacher:subscribe', { examSessionId });
    }

    // Upsert by studentId rather than always appending: if the same agent
    // disconnects and reconnects (a fresh `agent:join`), the server
    // broadcasts `lobby:student_joined` again — that should flip the
    // existing row back to "connected" with the new joinedAt, not create a
    // second row for the same student.
    function handleStudentJoined(payload: LobbyStudentJoinedPayload) {
      setStudents((prev) => {
        const next: LobbyStudent = {
          studentId: payload.studentId,
          fullName: payload.fullName,
          joinedAt: payload.joinedAt,
          status: 'connected',
        };
        const existingIndex = prev.findIndex((s) => s.studentId === payload.studentId);
        if (existingIndex === -1) {
          return [...prev, next];
        }
        const copy = [...prev];
        copy[existingIndex] = next;
        return copy;
      });
    }

    // Marks the row disconnected — never removes it. A teacher needs to
    // see who *was* connected and dropped, not just who currently is.
    function handleAgentDisconnected(payload: AgentDisconnectedPayload) {
      setStudents((prev) =>
        prev.map((s) =>
          s.studentId === payload.studentId ? { ...s, status: 'disconnected' } : s,
        ),
      );
    }

    function handleSubscribeError(payload: TeacherSubscribeErrorPayload) {
      setSubscribeError(payload);
    }

    socket.on('connect', handleConnect);
    socket.on('lobby:student_joined', handleStudentJoined);
    socket.on('agent:disconnected', handleAgentDisconnected);
    socket.on('teacher:subscribe:error', handleSubscribeError);

    // The shared socket may already be connected (e.g. a fast client-side
    // navigation from one lobby straight to another) — `connect` would
    // never fire again in that case, so subscribe immediately instead of
    // waiting for an event that already happened.
    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('lobby:student_joined', handleStudentJoined);
      socket.off('agent:disconnected', handleAgentDisconnected);
      socket.off('teacher:subscribe:error', handleSubscribeError);
      // Disconnect on unmount, not just remove listeners — see
      // lib/socket.ts's comment on why this page owns the connect/
      // disconnect lifecycle (no `teacher:unsubscribe` event exists to
      // leave just this session's room otherwise).
      socket.disconnect();
    };
  }, [examSessionId]);

  const connectedCount = students.filter((s) => s.status === 'connected').length;

  return (
    <main className="app-wash min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="icon-chip mt-0.5 h-10 w-10 bg-gradient-to-br from-primary to-accent text-white shadow-sm">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1">
              <h1 className="text-h1 text-foreground">Phòng chờ phiên thi</h1>
              {sessionDetail.data && (
                <p className="text-body text-muted-foreground">{sessionDetail.data.name}</p>
              )}
            </div>
          </div>
          {displayStatus && (
            <Badge variant={displayStatus.variant} className="shrink-0 self-start">
              {displayStatus.label}
            </Badge>
          )}
        </div>

        {displayStatus && displayStatus.label !== 'Đang diễn ra' && (
          <Alert variant={displayStatus.label === 'Đã kết thúc' ? 'warning' : 'info'}>
            <AlertDescription>
              {displayStatus.label === 'Đã kết thúc' ? (
                <>
                  Kỳ thi này đã kết thúc lúc {formatDateTime(sessionDetail.data!.endTime)}. Đây là
                  chế độ xem lại — sinh viên không thể tham gia mới (máy chủ đã tự chặn ở bước
                  kết nối, kể cả khi còn nhớ mã phiên thi).
                </>
              ) : (
                <>
                  Kỳ thi này chưa bắt đầu — sẽ mở lúc {formatDateTime(sessionDetail.data!.startTime)}.
                  Sinh viên chưa thể tham gia trước thời điểm đó.
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {subscribeError ? (
          // A distinct, visible failure state — role="alert" + destructive
          // styling — instead of silently rendering an empty roster when
          // the subscribe actually failed (expired JWT, not the session
          // owner, or a bogus session id).
          <Card>
            <CardHeader>
              <CardTitle>Không thể mở phòng chờ</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertDescription>
                  {SUBSCRIBE_ERROR_MESSAGES[subscribeError.code] ?? subscribeError.message}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between gap-4 border-b border-border bg-surface-2/60">
              <CardTitle className="text-h3">Sinh viên trong phòng</CardTitle>
              <span className="flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.08em] text-success-strong">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                Trực tiếp
              </span>
            </CardHeader>

            {/* Count-only aria-live region: announces "3 sinh viên đã tham
                gia" on change without re-announcing the entire table on
                every join/disconnect. */}
            <p
              aria-live="polite"
              className="border-b border-border px-6 py-3 text-body text-muted-foreground"
            >
              Số sinh viên đã tham gia:{' '}
              <strong className="text-h3 text-foreground">{students.length}</strong> (
              {connectedCount} đang kết nối)
            </p>

            <CardContent className="p-0">
              <LobbyList students={students} />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
