'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ClipboardCheck, DoorOpen } from 'lucide-react';
import { toast } from 'sonner';
import { socket } from '@/lib/socket';
import { createSubscriptionRecovery } from '@/lib/socket-recovery';
import { refreshSession } from '@/lib/api-client';
import type { PendingAccessRequest } from '@/lib/access-request';
import {
  useAttendance,
  useConfirmAttendance,
  useConfirmSessionEnd,
  useExamSessionDetail,
  useFinalizeExamSession,
  useOpenSession,
  useRecollect,
  useSubmissions,
} from '@/hooks/useExamSession';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getDisplaySessionStatus } from '@/lib/exam-session-display';
import { getSessionPhase } from '@/lib/submission-attention';
import {
  buildSubmissionRows,
  countFullySubmitted,
  countRecollectTargets,
  countStudentsSubmittingAfter,
  type DeliverableState,
} from '@/lib/submission-rows';
import { AccessRequestPanel } from './_components/AccessRequestPanel';
import { CollectionPhaseActions } from './_components/CollectionPhaseActions';
import { AttendancePanel } from './_components/AttendancePanel';
import { ExamMaterialsCard } from './_components/ExamMaterialsCard';
import { SubmissionStatusTable } from './_components/SubmissionStatusTable';
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
/**
 * Both of these now only say "the room changed" — the room itself is read
 * back from the attendance log, which is the only copy that survives a
 * refresh. Their fields are still part of the wire contract; this page
 * simply no longer keeps its own tally from them.
 */
type RoomChangedPayload = unknown;

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
  const confirmEnd = useConfirmSessionEnd(examSessionId);
  const recollect = useRecollect(examSessionId);

  const attendance = useAttendance(examSessionId);
  const confirmAttendance = useConfirmAttendance(examSessionId);
  const openSession = useOpenSession(examSessionId);
  const refetchAttendance = attendance.refetch;

  const [liveSubmissions, setLiveSubmissions] = useState<LiveSubmissionMap>({});
  const [subscribeError, setSubscribeError] = useState<TeacherSubscribeErrorPayload | null>(
    null,
  );
  // Students outside the class roster asking to be let in (Security rule
  // 1's human override). Kept in page state, not the query cache — same
  // reasoning as liveSubmissions: this only ever grows/shrinks from
  // socket events and a resolve action, never from a refetch.
  const [pendingAccessRequests, setPendingAccessRequests] = useState<PendingAccessRequest[]>([]);
  // Gates both the state update and the toast in handleAccessRequest below
  // on the exact same check — a ref, not state, because it's read-and-
  // written synchronously inside a socket callback and never needs to
  // trigger a render on its own.
  const knownAccessRequestIds = useRef<Set<string>>(new Set());
  const teachingClasses = useTeachingClasses();
  // So theo TÊN môn: khoá ngoại tới bảng `course` biến mất ở đợt thu hẹp
  // master data, và tên là thứ duy nhất còn lại để nhận ra hai lớp cùng môn.
  // Gõ lệch một ký tự thì lớp đó không hiện ra trong danh sách chọn lớp gốc
  // — giám thị vẫn duyệt được, chỉ là phải tìm đúng cách viết.
  const classesForThisCourse = useMemo(
    () =>
      (teachingClasses.data ?? []).filter(
        (k) => k.courseName === sessionDetail.data?.courseName,
      ),
    [teachingClasses.data, sessionDetail.data?.courseName],
  );

  /**
   * A room of forty agents joins in a burst, and each join is one event. A
   * refetch per event would be forty requests for one answer, so they
   * collapse into one trailing read.
   */
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAttendanceRefetch = useCallback(() => {
    if (refetchTimer.current) {
      clearTimeout(refetchTimer.current);
    }
    refetchTimer.current = setTimeout(() => void refetchAttendance(), 600);
  }, [refetchAttendance]);

  useEffect(
    () => () => {
      if (refetchTimer.current) {
        clearTimeout(refetchTimer.current);
      }
    },
    [],
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
    setLiveSubmissions({});
    setPendingAccessRequests([]);

    // Created per mount, and capped at one attempt for its whole life — see
    // createSubscriptionRecovery for why that cap is the loop guard rather
    // than mere caution.
    const recovery = createSubscriptionRecovery({
      refresh: refreshSession,
      reconnect: () => {
        // Disconnect first, on purpose. socket.connect() on an already-open
        // socket is a no-op, and the open one is precisely the connection
        // holding the stale handshake cookie that caused this.
        socket.disconnect();
        socket.connect();
      },
    });

    // `teacher:subscribe` only joins a socket.io room — there is no
    // `teacher:unsubscribe` in the contract. Re-emitting on every
    // `connect` (not just the first) is required, not optional: if this
    // connection ever drops and socket.io-client's built-in reconnection
    // reconnects it, that is a brand-new server-side socket with no room
    // membership, so the subscription must be redone or this page would
    // silently stop receiving events after any network blip.
    function handleConnect() {
      // Cleared here, not just once on mount: `teacher:subscribe`'s
      // replay is the only authoritative list of what's still pending, so
      // a reconnect must rebuild from it rather than keep whatever this
      // tab happened to accumulate before the drop — a request another
      // invigilator resolved during the outage must not linger as a
      // stale row here. Clearing the dedup set alongside is what lets the
      // replayed events re-add themselves (and re-toast) instead of being
      // silently treated as "already known".
      setPendingAccessRequests([]);
      knownAccessRequestIds.current.clear();
      socket.emit('teacher:subscribe', { examSessionId });
    }

    // The event says the room changed; the server says how. Re-reading is
    // what makes a mid-exam refresh safe, and it is also the only way this
    // page can know a student is a make-up rather than a stranger — a fact
    // no socket payload carries.
    function handleRoomChanged(_payload: RoomChangedPayload) {
      scheduleAttendanceRefetch();
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

    // A student outside the roster asking to be let in — see
    // AccessRequestGateway.broadcast. Before this handler existed, this
    // event reached the browser and was simply never listened for: the
    // teacher was not told anything, ever, at any point. Two cues, not
    // one — a toast for "look now" and the panel itself (rendered below)
    // for "still here if you looked away" — because a toast alone is
    // gone in a few seconds if the teacher is looking at a different tab
    // or a projector, and a panel alone can be missed if it is below the
    // fold. Both cues gated on the SAME dedup set (cleared in
    // handleConnect above): `teacher:subscribe` replays whatever is still
    // pending on every (re)connect, and a request already known must
    // neither become a second row NOR fire a second toast — a Wi-Fi
    // hiccup with five requests already on screen must not restack five
    // more toasts for rows that never left.
    function handleAccessRequest(payload: PendingAccessRequest) {
      if (knownAccessRequestIds.current.has(payload.requestId)) {
        return;
      }
      knownAccessRequestIds.current.add(payload.requestId);
      setPendingAccessRequests((prev) => [...prev, payload]);
      toast.warning(`${payload.fullName} (MSSV ${payload.studentId}) xin vào phiên thi`, {
        description: payload.reason,
        duration: 10_000,
      });
    }

    socket.on('connect', handleConnect);
    socket.on('lobby:student_joined', handleRoomChanged);
    socket.on('agent:disconnected', handleRoomChanged);
    socket.on('lobby:submission_status', handleSubmissionStatus);
    socket.on('exam:finalize', handleExamFinalize);
    socket.on('lobby:access_request', handleAccessRequest);
    socket.on('teacher:subscribe:error', handleSubscribeError);

    // UNAUTHORIZED is the one code here that is usually recoverable, and it
    // used to be handled like the two that never are. The token behind a
    // socket is only ever checked at subscribe time, i.e. at (re)connect —
    // so this fires when a network blip reconnects a lobby that has been
    // open longer than ACCESS_TOKEN_TTL, which for a three-hour exam is
    // routine rather than exceptional. Refresh and redial before deciding
    // the session is over; show the message only once that has failed too.
    function handleSubscribeError(payload: TeacherSubscribeErrorPayload) {
      if (payload.code !== 'UNAUTHORIZED') {
        setSubscribeError(payload);
        return;
      }
      void recovery.recover().then((recovered) => {
        if (!recovered) {
          setSubscribeError(payload);
        }
      });
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
      socket.off('lobby:student_joined', handleRoomChanged);
      socket.off('agent:disconnected', handleRoomChanged);
      socket.off('lobby:submission_status', handleSubmissionStatus);
      socket.off('exam:finalize', handleExamFinalize);
      socket.off('lobby:access_request', handleAccessRequest);
      socket.off('teacher:subscribe:error', handleSubscribeError);
      // Disconnect on unmount, not just remove listeners — see
      // lib/socket.ts's comment on why this page owns the connect/
      // disconnect lifecycle (no `teacher:unsubscribe` event exists to
      // leave just this session's room otherwise).
      socket.disconnect();
    };
  }, [examSessionId, refetchSession, scheduleAttendanceRefetch]);

  const deliverables = useMemo(
    () =>
      (sessionDetail.data?.requiredDeliverables ?? []).map((d) => ({
        id: d.id,
        requiredFilename: d.requiredFilename,
      })),
    [sessionDetail.data],
  );

  // Who joined the lobby, plus what was already collected when the page
  // opened — the same union the per-session submissions detail page builds
  // from the same two sources (see lib/submission-rows.ts). Live socket
  // events are strictly newer than this and are overlaid separately below,
  // since a REST-only page has no such third source to merge in.
  const baseRows = useMemo(
    () => buildSubmissionRows(attendance.data, submissions.data?.items),
    [attendance.data, submissions.data],
  );

  const rows = useMemo(() => {
    if (Object.keys(liveSubmissions).length === 0) {
      return baseRows;
    }
    // Cloned, not mutated in place: `baseRows` is memoized on
    // attendance/submissions alone, so writing into its row objects here
    // would leak into the next render even if only `liveSubmissions`
    // changed — corrupting the very state this memo is meant to be pure
    // over.
    const byMssv = new Map(
      baseRows.map((row) => [row.studentMssv, { ...row, byDeliverable: { ...row.byDeliverable } }]),
    );
    for (const [key, value] of Object.entries(liveSubmissions)) {
      const separator = key.indexOf(':');
      const mssv = key.slice(0, separator);
      const deliverableId = key.slice(separator + 1);
      const row = byMssv.get(mssv) ?? { studentMssv: mssv, fullName: mssv, byDeliverable: {} };
      row.byDeliverable = { ...row.byDeliverable, [deliverableId]: { ...row.byDeliverable[deliverableId], ...value } };
      byMssv.set(mssv, row);
    }
    return [...byMssv.values()].sort((a, b) => a.studentMssv.localeCompare(b.studentMssv));
  }, [baseRows, liveSubmissions]);

  const fullySubmitted = useMemo(
    () => countFullySubmitted(rows, deliverables),
    [rows, deliverables],
  );

  // Ai CÓ MẶT — `rows` là hợp của roster và người đã nộp, nên nó cũng
  // chứa em vắng thi, và một máy chưa từng kết nối thì không có gì để
  // thu lại.
  const attendedMssv = useMemo(
    () =>
      new Set(
        [...(attendance.data?.present ?? []), ...(attendance.data?.makeup ?? [])].map(
          (student) => student.mssv,
        ),
      ),
    [attendance.data],
  );

  const recollectTargets = useMemo(
    () => countRecollectTargets(rows, attendedMssv, deliverables),
    [rows, attendedMssv, deliverables],
  );

  // Khi con số trên được tính. Ghi lại ở đây chứ không đọc `Date.now()`
  // lúc render: nếu socket rớt, `rows` ngừng đổi và mốc này đứng yên —
  // đó chính là tín hiệu giảng viên cần thấy. Đọc đồng hồ lúc render sẽ
  // cho ra một mốc luôn tươi mới trên một con số đã chết.
  const [countedAt, setCountedAt] = useState<number | null>(null);
  useEffect(() => {
    setCountedAt(Date.now());
  }, [rows]);

  const canFinalize = sessionDetail.data?.status === 'active';

  const phase = sessionDetail.data
    ? getSessionPhase(sessionDetail.data, Date.now())
    : null;

  /**
   * §7.1.1b. `agent:join` từ chối mọi sinh viên khi danh sách dự thi
   * chưa được đóng băng, và không có gì trên màn hình này từng nói ra
   * điều đó: panel điểm danh dựng từ `enrollment` nên nó vẫn hiện đủ
   * tên, đúng sĩ số, 0/N có mặt — giống hệt một phòng thi mà chưa ai
   * kịp tới.
   *
   * Chỉ hỏi ở hai pha mà việc mở phiên còn có nghĩa. Với phiên đã kết
   * thúc hoặc đã huỷ thì không còn gì để mở, và một lời mời ở đó chỉ
   * làm người đọc tưởng mình bỏ sót việc.
   */
  const needsOpening =
    attendance.data?.rosterFrozen === false && (phase === 'running' || phase === 'upcoming');

  /**
   * Spec §7.3 — có bao nhiêu SINH VIÊN nộp bài sau khi giảng viên xác
   * nhận kết thúc.
   *
   * Chỉ khi `completedBy` khác null: phiên do lượt quét dự phòng đóng
   * thì không có ai để xưng "bạn", và phiên tạo trước 2026-09-11 có cả
   * hai cột đều null, phải đọc là "không biết" chứ không phải "chưa xác
   * nhận" (spec §9.3).
   */
  const lateAfterConfirm = useMemo(() => {
    const { completedAt, completedBy } = sessionDetail.data ?? {};
    if (!completedAt || !completedBy) {
      return 0;
    }
    return countStudentsSubmittingAfter(rows, new Date(completedAt).getTime());
  }, [rows, sessionDetail.data]);

  return (
    <main className="app-wash min-h-screen bg-background px-4 py-8 md:px-8">
      {/* Wider than the rest of the app on purpose: from `lg` up the two
          roster panels sit side by side (see below), and 4xl left each of
          them too narrow to read. */}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
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

        {sessionDetail.data && (
          <CollectionPhaseActions
            status={sessionDetail.data.status}
            missingCount={recollectTargets}
            countedAt={countedAt}
            endTime={sessionDetail.data.endTime}
            recollecting={recollect.isPending}
            recollectError={recollect.error}
            onRecollect={() => recollect.mutateAsync()}
            confirming={confirmEnd.isPending}
            confirmError={confirmEnd.error}
            onConfirmEnd={() => confirmEnd.mutateAsync()}
          />
        )}

        {needsOpening && (
          <Alert variant="warning">
            <DoorOpen aria-hidden="true" />
            <AlertDescription>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <strong className="font-semibold">
                    Sinh viên chưa vào được — phiên thi chưa được mở.
                  </strong>
                  <span>
                    &ldquo;Đang diễn ra&rdquo; chỉ nói phiên đang trong khung giờ thi. Danh
                    sách dự thi thì chưa được chốt, nên máy chủ đang từ chối mọi máy sinh
                    viên. Bấm nút này để chốt danh sách và mở cửa phòng.
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 self-start sm:self-auto"
                  disabled={openSession.isPending}
                  // `mutate`, không phải `mutateAsync`: lỗi đã được hiện
                  // ngay dưới đây qua `openSession.error`, nên không có
                  // gì để nối tiếp — và một `mutateAsync` không ai bắt
                  // sẽ để lại unhandled rejection mỗi lần mở hụt.
                  onClick={() => openSession.mutate()}
                >
                  <DoorOpen className="h-4 w-4" aria-hidden="true" />
                  {openSession.isPending ? 'Đang mở…' : 'Mở phiên thi'}
                </Button>
              </div>
              {openSession.error && (
                <p className="mt-3 text-small text-danger-strong">
                  {openSession.error.message}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Spec §7.3. Không chặn bài về sau khi xác nhận, nhưng phải
            NÓI — giảng viên biết con số đã đổi, thay vì không biết. */}
        {lateAfterConfirm > 0 && (
          <Alert variant="info">
            <AlertDescription>
              Có {lateAfterConfirm} sinh viên nộp bài sau khi bạn xác nhận kết thúc.
            </AlertDescription>
          </Alert>
        )}

        {/* Phân nhánh theo PHASE, không theo chuỗi nhãn. So nhãn là lỗi
            có sẵn từ trước: `getDisplaySessionStatus` trả 'Đã hoàn thành'
            cho phiên `completed`, không phải 'Đã kết thúc', nên một phiên
            đã xong lại rơi vào nhánh else và hiện "chưa bắt đầu — sẽ mở
            lúc ...". Thêm `collecting` vào chỉ làm nó sai thêm một ca. */}
        {phase === 'ended' && (
          <Alert variant="warning">
            <AlertDescription>
              Kỳ thi này đã kết thúc lúc {formatDateTime(sessionDetail.data!.endTime)}. Đây là
              chế độ xem lại — sinh viên không thể tham gia mới (máy chủ đã tự chặn ở bước
              kết nối, kể cả khi còn nhớ mã phiên thi).
            </AlertDescription>
          </Alert>
        )}

        {(phase === 'upcoming' || phase === 'draft') && (
          <Alert variant="info">
            <AlertDescription>
              Kỳ thi này chưa bắt đầu — sẽ mở lúc {formatDateTime(sessionDetail.data!.startTime)}.
              Sinh viên chưa thể tham gia trước thời điểm đó.
            </AlertDescription>
          </Alert>
        )}

        {phase === 'cancelled' && (
          <Alert variant="warning">
            <AlertDescription>
              Phiên thi này đã bị huỷ. Sinh viên không thể tham gia.
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
            <AccessRequestPanel
              requests={pendingAccessRequests}
              classes={classesForThisCourse}
              onResolved={(requestId) => {
                knownAccessRequestIds.current.delete(requestId);
                setPendingAccessRequests((prev) => prev.filter((r) => r.requestId !== requestId));
              }}
            />

            {sessionDetail.data && (
              <ExamMaterialsCard
                examSessionId={examSessionId}
                releaseAt={formatDateTime(sessionDetail.data.startTime)}
                // `collecting` cũng phải chặn, không chỉ `completed`:
                // API dùng `isExamOver()` và trả 403 cho cả hai (xem
                // exam-material.service.ts). Để nút sửa hiện ra ở đây sẽ
                // mời giảng viên bấm vào một thứ chắc chắn hỏng.
                canEdit={
                  sessionDetail.data.status !== 'completed' &&
                  sessionDetail.data.status !== 'collecting'
                }
              />
            )}

            {/* Who is in the room, and what has arrived from them — two
                halves of the same question, so they belong beside each
                other rather than a screen apart. Stacked below `lg`;
                `items-start` so the shorter panel keeps its own height
                instead of stretching to match the taller one. */}
            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
              {/* Each panel is bounded to the viewport and pinned there,
                  and the list inside it then takes whatever height is
                  left over (`flex-1` against these `flex` columns).

                  That indirection is the point: capping the lists against
                  a constant instead would mean guessing how tall
                  everything above them is, and that height is not
                  knowable here — the ended-session alert, the materials
                  list and AccessRequestPanel all come and go, and
                  DiscrepancyNotice inside the attendance card names one
                  student per unaccounted submission, so it has no upper
                  bound at all. Measuring nothing beats guessing well.

                  `3rem` is the only number, and it describes this rule
                  rather than the page: the 1.5rem pin offset, plus the
                  same again so the panel does not sit flush against the
                  bottom edge. `min-h` keeps a short-but-wide window (a
                  1024x400 window is a real thing on Windows) from
                  collapsing the lists to nothing. */}
              <div className="lg:sticky lg:top-6 lg:flex lg:max-h-[calc(100dvh-3rem)] lg:min-h-[22rem] lg:flex-col">
              <AttendancePanel
                attendance={attendance.data}
                isLoading={attendance.isLoading}
                error={attendance.error}
                canConfirm={canFinalize}
                confirming={confirmAttendance.isPending}
                confirmError={confirmAttendance.error}
                onConfirm={() => confirmAttendance.mutate()}
                // AttendancePanel loads independently of sessionDetail (its
                // own isLoading/error come from the attendance query alone)
                // — an empty fallback here just means lateMinutes() can't
                // compute yet (Number.isNaN guards it), not a crash, for
                // however briefly sessionDetail is still loading.
                startTime={sessionDetail.data?.startTime ?? ''}
              />
              </div>

              <div className="lg:sticky lg:top-6 lg:flex lg:max-h-[calc(100dvh-3rem)] lg:min-h-[22rem] lg:flex-col">
              <Card className="overflow-hidden lg:flex lg:min-h-0 lg:flex-col">
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

                {/* `min-h-0` is load-bearing, not decoration: a flex item
                    defaults to `min-height: auto`, which refuses to shrink
                    below its content, and the table inside is exactly the
                    content that would refuse. Without it the card grows
                    past the viewport and the cap above does nothing. */}
                <CardContent className="p-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                  <SubmissionStatusTable deliverables={deliverables} students={rows} />
                </CardContent>
              </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
