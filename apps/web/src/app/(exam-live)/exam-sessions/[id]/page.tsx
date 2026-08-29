'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { socket } from '@/lib/socket';
import {
  useExamSessionDetail,
  useFinalizeExamSession,
  useSubmissions,
} from '@/hooks/useExamSession';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getDisplaySessionStatus } from '@/lib/exam-session-display';
import { LobbyList, type LobbyStudent } from './_components/LobbyList';
import {
  SubmissionStatusTable,
  type DeliverableState,
  type SubmissionRowStudent,
} from './_components/SubmissionStatusTable';
import { FinalizeSessionButton } from './_components/FinalizeSessionButton';

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
// (apps/api/src/exam-session/exam-session.gateway.ts and
// apps/api/src/submission/submission.gateway.ts). Kept local to this page
// rather than in `lib/socket.ts` — this page is the only consumer.
interface LobbyStudentJoinedPayload {
  studentId: string;
  fullName: string;
  joinedAt: string;
}

interface AgentDisconnectedPayload {
  studentId: string;
  disconnectedAt: string;
}

interface LobbySubmissionStatusPayload {
  studentId: string;
  requiredDeliverableId: string;
  status: 'collected' | 'invalid';
  submittedAt: string;
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

/** Live submission updates, keyed `${studentMssv}:${requiredDeliverableId}`. */
type LiveSubmissionMap = Record<string, { state: DeliverableState; submittedAt: string }>;

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
  // Pulled out so the socket effect can depend on a stable reference —
  // TanStack keeps `refetch` stable per query, unlike the result object.
  const refetchSession = sessionDetail.refetch;
  const displayStatus = sessionDetail.data
    ? getDisplaySessionStatus(
        sessionDetail.data.status,
        sessionDetail.data.startTime,
        sessionDetail.data.endTime,
      )
    : null;

  // What was already collected before this page opened. The socket only
  // reports what happens while it is open, so without this a refresh
  // mid-exam would show an empty table with every file already in storage.
  const submissions = useSubmissions(examSessionId);
  const finalize = useFinalizeExamSession(examSessionId);

  const [students, setStudents] = useState<LobbyStudent[]>([]);
  const [liveSubmissions, setLiveSubmissions] = useState<LiveSubmissionMap>({});
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
    setLiveSubmissions({});

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

    // Kept in its own state rather than merged into the query cache: a
    // refetch of `useSubmissions` must never wipe an event that arrived
    // since, and an event must never be clobbered by a slightly stale
    // fetch. The two are merged at render time instead (see `rows`).
    function handleSubmissionStatus(payload: LobbySubmissionStatusPayload) {
      setLiveSubmissions((prev) => ({
        ...prev,
        [`${payload.studentId}:${payload.requiredDeliverableId}`]: {
          state: payload.status,
          submittedAt: payload.submittedAt,
        },
      }));
    }

    // The session just ended (scheduled sweep, or a teacher — possibly on
    // another screen — pressing "Chốt bài ngay"). Re-read the status
    // instead of assuming it, so this page shows what the DB actually says.
    function handleExamFinalize() {
      void refetchSession();
    }

    socket.on('connect', handleConnect);
    socket.on('lobby:student_joined', handleStudentJoined);
    socket.on('agent:disconnected', handleAgentDisconnected);
    socket.on('lobby:submission_status', handleSubmissionStatus);
    socket.on('exam:finalize', handleExamFinalize);
    socket.on('teacher:subscribe:error', handleSubscribeError);

    function handleSubscribeError(payload: TeacherSubscribeErrorPayload) {
      setSubscribeError(payload);
    }

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
      socket.off('lobby:submission_status', handleSubmissionStatus);
      socket.off('exam:finalize', handleExamFinalize);
      socket.off('teacher:subscribe:error', handleSubscribeError);
      // Disconnect on unmount, not just remove listeners — see
      // lib/socket.ts's comment on why this page owns the connect/
      // disconnect lifecycle (no `teacher:unsubscribe` event exists to
      // leave just this session's room otherwise).
      socket.disconnect();
    };
  }, [examSessionId, refetchSession]);

  const deliverables = useMemo(
    () =>
      (sessionDetail.data?.requiredDeliverables ?? []).map((d) => ({
        id: d.id,
        requiredFilename: d.requiredFilename,
      })),
    [sessionDetail.data],
  );

  /**
   * One row per student, from the union of three sources: who joined the
   * lobby, what was already collected when the page opened, and what has
   * arrived over the socket since. A student who joined but submitted
   * nothing still needs a row (all "Chưa nộp"), and a student whose join
   * event predates this page still needs one too.
   */
  const rows = useMemo<SubmissionRowStudent[]>(() => {
    const byMssv = new Map<string, SubmissionRowStudent>();

    const ensure = (mssv: string, fullName: string) => {
      const existing = byMssv.get(mssv);
      if (existing) {
        // A real name always beats the MSSV placeholder, whichever source
        // happened to be seen first.
        if (existing.fullName === mssv && fullName !== mssv) {
          existing.fullName = fullName;
        }
        return existing;
      }
      const created: SubmissionRowStudent = { studentMssv: mssv, fullName, byDeliverable: {} };
      byMssv.set(mssv, created);
      return created;
    };

    for (const student of students) {
      ensure(student.studentId, student.fullName);
    }

    for (const item of submissions.data?.items ?? []) {
      const row = ensure(item.studentMssv, item.studentNameInput || item.studentMssv);
      // Only the two terminal states are shown; `received`/`validated`
      // exist for milliseconds inside one server-side transaction and are
      // not something a teacher can act on.
      if (item.status === 'collected' || item.status === 'invalid') {
        row.byDeliverable[item.requiredDeliverableId] = {
          state: item.status,
          submittedAt: item.submittedAt,
        };
      }
    }

    // Live events last: they are strictly newer than the initial fetch.
    for (const [key, value] of Object.entries(liveSubmissions)) {
      const separator = key.indexOf(':');
      const mssv = key.slice(0, separator);
      const deliverableId = key.slice(separator + 1);
      const row = ensure(mssv, mssv);
      row.byDeliverable[deliverableId] = value;
    }

    return [...byMssv.values()].sort((a, b) =>
      a.studentMssv.localeCompare(b.studentMssv),
    );
  }, [students, submissions.data, liveSubmissions]);

  const fullySubmitted = useMemo(() => {
    if (deliverables.length === 0) {
      return 0;
    }
    return rows.filter((row) =>
      deliverables.every((d) => row.byDeliverable[d.id]?.state === 'collected'),
    ).length;
  }, [rows, deliverables]);

  const connectedCount = students.filter((s) => s.status === 'connected').length;
  const canFinalize = sessionDetail.data?.status === 'active';

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
          <div className="flex shrink-0 items-center gap-3 self-start">
            {displayStatus && (
              <Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>
            )}
            {sessionDetail.data && (
              <FinalizeSessionButton
                disabled={!canFinalize}
                submitting={finalize.isPending}
                error={finalize.error}
                onConfirm={() => finalize.mutateAsync()}
              />
            )}
          </div>
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
          <>
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

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border bg-surface-2/60">
                <CardTitle className="text-h3">Trạng thái nộp bài</CardTitle>
              </CardHeader>

              <p
                aria-live="polite"
                className="border-b border-border px-6 py-3 text-body text-muted-foreground"
              >
                <strong className="text-h3 text-foreground">
                  {fullySubmitted}/{rows.length}
                </strong>{' '}
                sinh viên đã nộp đủ {deliverables.length} file bắt buộc
              </p>

              {submissions.isError && (
                <div className="px-6 py-3">
                  <Alert variant="warning">
                    <AlertDescription>
                      Không tải được danh sách bài đã nộp trước đó. Bảng dưới chỉ hiển thị các
                      bài nộp phát sinh từ lúc mở trang này.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              <CardContent className="p-0">
                <SubmissionStatusTable deliverables={deliverables} students={rows} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
