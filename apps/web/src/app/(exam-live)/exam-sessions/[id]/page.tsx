'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { socket } from '@/lib/socket';
import { useExamSessionDetail } from '@/hooks/useExamSession';
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
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Phòng chờ phiên thi</h1>

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
        // styling — instead of silently rendering "Chưa có sinh viên nào
        // tham gia." when the subscribe actually failed (expired JWT, not
        // the session owner, or a bogus session id).
        <Card>
          <CardHeader>
            <CardTitle>Không thể mở phòng chờ</CardTitle>
          </CardHeader>
          <CardContent>
            <p role="alert" className="text-sm text-destructive">
              {SUBSCRIBE_ERROR_MESSAGES[subscribeError.code] ?? subscribeError.message}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Count-only aria-live region: announces "3 sinh viên đã tham
              gia" on change without re-announcing the entire table on
              every join/disconnect. */}
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Số sinh viên đã tham gia: <strong>{students.length}</strong> (
            {connectedCount} đang kết nối)
          </p>

          <Card>
            <CardContent className="pt-6">
              <LobbyList students={students} />
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
