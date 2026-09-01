/**
 * The Electron app's orchestration core — `cli.ts`'s `main()` body, ported
 * to a class that pushes state instead of printing lines, and takes
 * commands instead of reading a terminal. Design spec §7/§8.2.
 *
 * Deliberately has no `electron` import anywhere in this file: it only
 * knows sockets and the filesystem, so it can be unit-tested exactly like
 * `snapshot.test.ts` — spin up a real (tiny) socket.io server, drive a
 * real client against it, assert on the `state` events that come out.
 * `electron/main/index.ts` is the only place that imports both this file
 * and `electron` — it wires `state`/`notify` events to a `BrowserWindow`
 * and native `Notification`s.
 *
 * One instance per app run — this app manages exactly one student's
 * session on one machine, never several.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { io, Socket } from 'socket.io-client';
import type { AgentJoinAck, AgentJoinError, AgentJoinErrorCode, AgentJoinPayload } from './agent-contract';
import { NoTerminalError as _NoTerminalError, sendAccessRequest, type AccessErrorCode } from './access-request';
import { restoreBackup, startSnapshotLoop } from './backup';
import { downloadMaterials, writeInstructions } from './exam-materials';
import {
  formatSummary,
  uploadAllDeliverables,
  type ExamFinalizePayload,
  type RequiredDeliverable,
  type UploadSummary,
} from './submission-uploader';
import {
  createSubmissionFiles,
  isSafeForPathSegment,
  makeWorkspaceReader,
  WORKSPACE_DIRNAME,
} from './workspace-files';

// _NoTerminalError: access-request.ts's readline-based promptAccessRequest
// is what throws it — this controller never calls that function (the
// renderer collects fullName/reason instead), so it never surfaces here.
// Imported with an underscore only to document that this was considered,
// not missed.
void _NoTerminalError;

// ---------------------------------------------------------------------------
// State shape pushed to the renderer
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'connect_error';

/**
 * One value per screen in the design spec's §4 flow table, plus
 * `connect_error` for §2 non-goals' "the one failure mode with no channel
 * to notify the teacher through" (mockup group 1b).
 */
export type JoinPhase =
  | 'form' // state a
  | 'joining' // state b
  | 'joined' // state c
  | 'error' // state d
  | 'rate_limited' // state d2
  | 'session_not_active' // state e
  | 'access_request_form' // state f
  | 'access_request_pending' // state g
  | 'connect_error'; // group 1b

/** A couple of purely client-side outcomes the wire contract has no code
 *  for, alongside the real `AgentJoinErrorCode`s. */
export type UiErrorCode = AgentJoinErrorCode | 'ACCESS_DENIED' | 'ACCESS_REQUEST_FAILED';

export interface JoinErrorState {
  code: UiErrorCode;
  message: string;
  /** Only set when code is RATE_LIMITED — an absolute timestamp (ISO), not
   *  a duration, so the renderer's own countdown stays correct even if it
   *  misses a tick; never re-derived from a re-push of this same state. */
  retryUntil?: string;
}

export interface RequiredFileStatus {
  filename: string;
  created: boolean;
}

export interface BackupState {
  available: boolean;
  status: 'idle' | 'restoring' | 'restored' | 'nothing-to-restore' | 'failed';
  restoredCount: number;
  skippedCount: number;
  lastSnapshotAt: string | null;
  lastSnapshotFailed: boolean;
}

export interface MaterialsState {
  count: number;
  releaseAt: string | null;
  status: 'idle' | 'pending' | 'downloaded' | 'not-yet' | 'none' | 'failed';
  downloadedFileNames: string[];
}

export interface SubmissionState {
  finalizing: boolean;
  summary: UploadSummary | null;
}

export interface LogEntry {
  at: string;
  message: string;
}

export interface AgentState {
  connection: ConnectionStatus;
  joinPhase: JoinPhase;
  joinError: JoinErrorState | null;
  studentId: string | null;
  sessionCode: string | null;
  studentName: string | null;
  sessionName: string | null;
  endTime: string | null;
  confirmedAt: string | null;
  requiredFiles: RequiredFileStatus[];
  backup: BackupState;
  materials: MaterialsState;
  submission: SubmissionState;
  log: LogEntry[];
  /**
   * True from the moment `exam:finalize` is first received, forever —
   * regardless of whether the upload itself succeeds. Once the server has
   * closed the session, nothing this client does can reopen it, and a
   * later reconnect (network blip, laptop sleep, a dev-server restart)
   * must not try `agent:join` again: the server would reject it with
   * SESSION_NOT_ACTIVE now that the session is 'completed', and treating
   * that like any other join error would regress the UI from "already
   * submitted" back to a join/error screen — see connectSocket's
   * `on('connect')` and handleJoinError's own `examEnded` guards.
   */
  examEnded: boolean;
}

export interface NotifyEvent {
  title: string;
  body: string;
}

// A capped log, not an unbounded one — this process is meant to run for a
// whole exam sitting.
const MAX_LOG_ENTRIES = 200;

function initialState(): AgentState {
  return {
    connection: 'idle',
    joinPhase: 'form',
    joinError: null,
    studentId: null,
    sessionCode: null,
    studentName: null,
    sessionName: null,
    endTime: null,
    confirmedAt: null,
    requiredFiles: [],
    backup: {
      available: false,
      status: 'idle',
      restoredCount: 0,
      skippedCount: 0,
      lastSnapshotAt: null,
      lastSnapshotFailed: false,
    },
    materials: { count: 0, releaseAt: null, status: 'idle', downloadedFileNames: [] },
    submission: { finalizing: false, summary: null },
    log: [],
    examEnded: false,
  };
}

/** Same non-object guard the gateway itself uses on the way in — applied
 *  here on the way back, since a malformed or hostile server response is
 *  just as untrustworthy as a malformed client request. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface SessionControllerOptions {
  backendUrl: string;
  /** Where `exam-workspace/<studentId>/` is created. Injected rather than
   *  read from `process.cwd()` (what `cli.ts` used) — that has no stable
   *  meaning for a packaged Electron app, and injecting it here is what
   *  keeps this class testable without Electron: a test passes a tmp dir,
   *  `electron/main/index.ts` passes `app.getPath('documents')`. */
  workspaceRoot: string;
}

/**
 * Emits exactly three events — documented here rather than as overloaded
 * `on()` signatures (which would need unsafe class/interface declaration
 * merging) since `EventEmitter` itself is already untyped:
 *   - `'state'`         — `(state: {@link AgentState}) => void`, on every
 *     state change.
 *   - `'notify'`        — `(notification: {@link NotifyEvent}) => void`,
 *     for the moments `electron/main` should fire a native `Notification`.
 *   - `'open-workspace'` — `(workspaceDir: string) => void`, fired once,
 *     right after the FIRST successful join creates the workspace folder —
 *     `electron/main` opens it in the OS file manager so the student never
 *     has to go looking for it themselves (CLAUDE.md's "don't push work
 *     onto anyone the system can resolve itself"). Deliberately not
 *     re-fired on a reconnect's repeat `agent:join:ack` (see
 *     `doHandleJoinAck`'s `isFirstJoin`) — the folder is already open by
 *     then, and popping a second Explorer window on every network blip
 *     would be the opposite of "stay out of the way".
 */
export class SessionController extends EventEmitter {
  private readonly backendUrl: string;
  private readonly workspaceRoot: string;
  private state: AgentState = initialState();

  private socket: Socket | null = null;
  private hasJoinedOnce = false;
  private shuttingDown = false;
  private finalizing = false;
  private stopSnapshots: (() => void) | null = null;

  // Set once a join() attempt has passed local validation — reused by
  // reconnects and by the access-request/grant flow's re-join, exactly
  // like cli.ts's closed-over `payload`.
  private lastJoinPayload: AgentJoinPayload | null = null;
  private examSessionId: string | null = null;
  private requiredDeliverables: RequiredDeliverable[] = [];
  private workspaceDir: string | null = null;

  constructor(options: SessionControllerOptions) {
    super();
    this.backendUrl = options.backendUrl;
    this.workspaceRoot = options.workspaceRoot;
    // Without this, the renderer's join form never appears: main.ts's
    // `webContents.on('did-finish-load', ...)` only replays a state if
    // `latestState` is already set, which only happens once this class
    // has emitted 'state' at least once — and nothing did that until the
    // student called join(), which they cannot do on a window with no
    // form rendered yet. A blank window forever, on every fresh launch —
    // missed by every automated check here (they all call join()
    // immediately) and by the "process stayed alive" smoke test, since
    // neither one looks at what actually rendered.
    //
    // queueMicrotask, not a synchronous emit: a listener attached right
    // after `new SessionController(...)` (main.ts's `c.on('state', ...)`
    // does exactly this, synchronously, in the same tick) would miss a
    // synchronous emit fired from inside the constructor it's still
    // returning from. Deferring to the next microtask guarantees that
    // listener is already registered by the time this fires.
    queueMicrotask(() => {
      this.emit('state', this.state);
    });
  }

  getState(): AgentState {
    return this.state;
  }

  // -------------------------------------------------------------------
  // Commands (renderer -> main -> here)
  // -------------------------------------------------------------------

  /**
   * Submits the join form (state a's "Xác nhận vào thi", state d/d2/e's
   * "Thử lại"/"Quay lại", and the manual retry in group 1b — all four are
   * the same action: try to join with whatever is in the two fields now).
   */
  join(payload: { studentId: string; sessionCode: string }): void {
    if (!isSafeForPathSegment(payload.studentId)) {
      this.setJoinError('INVALID_INPUT', 'Mã số sinh viên chứa ký tự không hợp lệ.');
      return;
    }

    this.lastJoinPayload = {
      studentId: payload.studentId,
      sessionCode: payload.sessionCode,
      machineName: machineName(),
    };
    this.workspaceDir = path.resolve(this.workspaceRoot, WORKSPACE_DIRNAME, payload.studentId);

    this.patch({
      studentId: payload.studentId,
      sessionCode: payload.sessionCode,
      joinError: null,
    });

    if (!this.socket) {
      this.connectSocket();
      return;
    }
    if (this.socket.connected) {
      this.emitJoin();
    } else {
      // Mid-reconnect (or the manual retry button in group 1b) — force an
      // immediate attempt instead of waiting for socket.io's own backoff
      // timer. The 'connect' handler re-emits agent:join once it lands.
      this.socket.connect();
    }
  }

  /** State f's "Gửi yêu cầu" — the one place a typed name is real input. */
  sendAccessRequest(payload: { fullName: string; reason: string }): void {
    if (!this.socket || !this.state.studentId || !this.state.sessionCode) {
      this.setJoinError('ACCESS_REQUEST_FAILED', 'Chưa có phiên kết nối để gửi yêu cầu.');
      return;
    }
    const studentId = this.state.studentId;
    const sessionCode = this.state.sessionCode;
    this.setJoinPhase('access_request_pending');

    void sendAccessRequest(this.socket, {
      sessionCode,
      studentId,
      fullName: payload.fullName,
      reason: payload.reason,
    })
      .then((ack) => {
        if (ack.ok) {
          this.log('Đã gửi yêu cầu, đang chờ giảng viên duyệt.');
          return;
        }
        if (ack.code === 'ALREADY_ENROLLED') {
          this.log('Bạn đã có trong danh sách. Đang thử vào thi lại...');
          this.setJoinPhase('joining');
          this.emitJoin();
          return;
        }
        this.setJoinError('ACCESS_REQUEST_FAILED', describeAccessError(ack.code, ack.message));
      })
      .catch((error: unknown) => {
        this.setJoinError('ACCESS_REQUEST_FAILED', describeError(error));
      });
  }

  /**
   * Cleans up this controller's own resources (snapshot timer, socket).
   * Does NOT call `process.exit`/`app.quit` — that is `electron/main`'s
   * call, made after this resolves cleanly, same separation `cli.ts`'s
   * own `shutdown()` had between socket teardown and `process.exit`.
   */
  quit(): void {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;
    this.stopSnapshots?.();
    this.stopSnapshots = null;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
  }

  // -------------------------------------------------------------------
  // Socket wiring
  // -------------------------------------------------------------------

  private connectSocket(): void {
    this.patch({ connection: 'connecting' });
    // No cookie/JWT — agents are public/unauthenticated by design, unlike
    // the teacher lobby (which authenticates via an httpOnly cookie).
    const socket = io(`${this.backendUrl}/exam-live`, { reconnection: true });
    this.socket = socket;

    socket.on('connect', () => {
      this.patch({ connection: 'connected' });
      if (this.state.examEnded) {
        // The exam is already over for this student (exam:finalize was
        // already received at least once) — re-emitting agent:join here
        // would only get rejected with SESSION_NOT_ACTIVE now that the
        // session itself is 'completed' server-side, which would wrongly
        // regress the UI from "already submitted" back to an error/join
        // screen. Nothing left to authenticate once the exam has ended,
        // successfully uploaded or not.
        this.log('Kết nối lại sau khi bài thi đã kết thúc — không gửi lại yêu cầu vào thi.');
        return;
      }
      this.emitJoin();
    });

    socket.on('connect_error', (error: Error) => {
      this.patch({ connection: 'connect_error' });
      if (!this.hasJoinedOnce) {
        // Group 1b — the one failure mode with no channel to notify the
        // teacher through, because the channel itself is what is down.
        this.setJoinPhase('connect_error');
      }
      this.log(`Không kết nối được: ${error.message}. Đang thử lại...`);
    });

    socket.on('disconnect', (reason: string) => {
      this.patch({ connection: 'disconnected' });
      // "...Đang thử kết nối lại" would be a lie once the exam has ended:
      // the transport may still reconnect, but connect's own examEnded
      // guard above means nothing more actually happens when it does.
      if (!this.shuttingDown && this.hasJoinedOnce && !this.state.examEnded) {
        this.notify('Mất kết nối', `Mất kết nối tới máy chủ (${reason}). Đang thử kết nối lại...`);
      }
    });

    socket.on('agent:join:ack', (ack: unknown) => {
      if (!isPlainObject(ack)) {
        this.log('[CẢNH BÁO] Server gửi agent:join:ack không hợp lệ — bỏ qua.');
        return;
      }
      void this.handleJoinAck(ack as unknown as AgentJoinAck);
    });

    socket.on('agent:join:error', (error: unknown) => {
      if (!isPlainObject(error)) {
        this.setJoinError('INVALID_INPUT', 'Server phản hồi không hợp lệ.');
        return;
      }
      this.handleJoinError(error as unknown as AgentJoinError);
    });

    socket.on('exam:finalize', (payload: unknown) => {
      if (!isPlainObject(payload)) {
        this.log('[CẢNH BÁO] Server gửi exam:finalize không hợp lệ — bỏ qua.');
        return;
      }
      void this.handleFinalize(payload as unknown as ExamFinalizePayload);
    });

    socket.on('agent:access-granted', () => {
      this.notify('Đã được duyệt', 'Giảng viên đã duyệt yêu cầu. Đang vào phòng thi...');
      this.setJoinPhase('joining');
      this.emitJoin();
    });

    socket.on('agent:access-denied', (body: unknown) => {
      const message =
        isPlainObject(body) && typeof body.message === 'string'
          ? body.message
          : 'Giảng viên đã từ chối yêu cầu.';
      this.setJoinError('ACCESS_DENIED', message);
    });
  }

  private emitJoin(): void {
    if (!this.lastJoinPayload || !this.socket) {
      return;
    }
    this.setJoinPhase('joining');
    this.socket.emit('agent:join', this.lastJoinPayload);
  }

  // -------------------------------------------------------------------
  // agent:join:ack — ordering-sensitive: restore MUST finish before the
  // required files are created (see workspace-files.createSubmissionFiles'
  // own doc comment for why).
  // -------------------------------------------------------------------

  private async handleJoinAck(ack: AgentJoinAck): Promise<void> {
    try {
      await this.doHandleJoinAck(ack);
    } catch (error) {
      // Fired from a socket listener via `void this.handleJoinAck(...)` —
      // an uncaught rejection here has no `.catch` to land in and would
      // crash Electron's main process outright, at the exact moment a
      // student is mid-exam. Reported, not swallowed: the student is
      // already confirmed joined by this point (that patch happens first,
      // synchronously, below), so this can only affect backup/materials/
      // instructions — worth surfacing, never worth taking the app down
      // for.
      this.log(`Lỗi không mong muốn sau khi vào thi: ${describeError(error)}`);
    }
  }

  private async doHandleJoinAck(ack: AgentJoinAck): Promise<void> {
    // Captured before the flag flips: a reconnect replays this same method
    // (server re-acks `agent:join`), and `isFirstJoin` is what keeps
    // 'open-workspace' a one-time thing instead of firing on every blip.
    const isFirstJoin = !this.hasJoinedOnce;
    this.hasJoinedOnce = true;
    const studentId = this.state.studentId ?? '';
    const workspaceDir = this.workspaceDir!;

    this.examSessionId = typeof ack.examSessionId === 'string' ? ack.examSessionId : null;
    this.requiredDeliverables = Array.isArray(ack.requiredDeliverables) ? ack.requiredDeliverables : [];

    this.patch({
      joinPhase: 'joined',
      joinError: null,
      connection: 'connected',
      studentName: typeof ack.studentName === 'string' ? ack.studentName : null,
      sessionName: typeof ack.sessionName === 'string' ? ack.sessionName : null,
      endTime: typeof ack.endTime === 'string' ? ack.endTime : null,
      confirmedAt: new Date().toISOString(),
      backup: { ...this.state.backup, available: ack.backupAvailable === true },
    });
    this.notify(
      'Đã điểm danh',
      this.state.studentName ? `Xác nhận danh tính: ${this.state.studentName}.` : 'Đã tham gia phiên thi.',
    );

    if (!isFirstJoin) {
      // Kết nối lại — giữ nguyên toàn bộ file đã có trên máy, không đụng
      // tới filesystem. state.requiredFiles already holds the checklist
      // from the real first join and stays exactly as it was.
      this.log('Đã kết nối lại. Giữ nguyên các file đã có trên máy, không tạo lại.');
    } else {
      if (ack.backupAvailable === true) {
        this.patch({ backup: { ...this.state.backup, status: 'restoring' } });
        const outcome = await restoreBackup(this.socket!, workspaceDir);
        if (outcome.status === 'restored') {
          this.patch({
            backup: {
              ...this.state.backup,
              status: 'restored',
              restoredCount: outcome.restored,
              skippedCount: outcome.skipped,
            },
          });
          this.log(`Đã khôi phục ${outcome.restored} file từ bản sao lưu (giữ nguyên ${outcome.skipped} file có sẵn).`);
        } else if (outcome.status === 'failed') {
          this.patch({ backup: { ...this.state.backup, status: 'failed' } });
          this.notify('Không khôi phục được bản sao lưu', 'Bạn vẫn làm bài bình thường — hãy báo giám thị nếu bài làm cũ bị mất.');
        } else {
          this.patch({ backup: { ...this.state.backup, status: 'nothing-to-restore' } });
        }
      }

      const created = createSubmissionFiles(workspaceDir, ack.requiredFiles);
      this.patch({ requiredFiles: created.files });
      this.log(`Đã tạo ${created.createdCount} file, sẵn sàng làm bài. Thư mục: ${workspaceDir}`);
    }
    if (isFirstJoin) {
      // Fired before materials/instructions finish writing, not after —
      // those can take a real amount of time on a slow connection, and the
      // student's own required files already exist right now. The file
      // manager window shows whatever is in the folder at the moment it's
      // opened AND keeps refreshing as more arrives, so there's no benefit
      // to waiting for the rest.
      this.emit('open-workspace', workspaceDir);
    }

    const materialNames: string[] = [];
    if (typeof ack.examMaterialCount === 'number' && ack.examMaterialCount > 0) {
      this.patch({
        materials: { ...this.state.materials, count: ack.examMaterialCount, status: 'pending' },
      });
      const outcome = await downloadMaterials(this.socket!, workspaceDir);
      materialNames.push(...outcome.fileNames);
      if (outcome.status === 'downloaded') {
        this.patch({
          materials: {
            ...this.state.materials,
            status: 'downloaded',
            downloadedFileNames: outcome.fileNames,
          },
        });
        if (outcome.downloaded > 0) {
          this.notify('Đã tải xong đề thi', `${outcome.downloaded} file trong thư mục "de-thi" — sẵn sàng làm bài.`);
        }
      } else if (outcome.status === 'not-yet') {
        this.patch({
          materials: {
            ...this.state.materials,
            status: 'not-yet',
            releaseAt: outcome.releaseAt ?? null,
          },
        });
        this.log(`Đề thi chưa mở — sẽ mở lúc ${outcome.releaseAt ?? '(chưa rõ)'}.`);
      } else if (outcome.status === 'failed') {
        this.patch({ materials: { ...this.state.materials, status: 'failed' } });
        this.notify('Không tải được đề thi', 'Hãy báo giám thị.');
      }
    }

    await writeInstructions(workspaceDir, {
      sessionName: this.state.sessionName ?? '(không rõ)',
      studentName: this.state.studentName,
      studentId,
      endTime: this.state.endTime ?? '(không rõ)',
      requiredFiles: Array.isArray(ack.requiredFiles) ? ack.requiredFiles : [],
      materialFileNames: materialNames,
    });

    if (!this.stopSnapshots) {
      this.stopSnapshots = startSnapshotLoop(this.socket!, workspaceDir, (result) => {
        if (result === 'failed') {
          this.patch({ backup: { ...this.state.backup, lastSnapshotFailed: true } });
          return;
        }
        if (result === 'uploaded') {
          this.patch({
            backup: { ...this.state.backup, lastSnapshotAt: new Date().toISOString(), lastSnapshotFailed: false },
          });
        }
        // 'empty' (nothing written yet) leaves lastSnapshotAt/lastSnapshotFailed
        // alone — there is nothing new to report, and clearing a real
        // earlier timestamp back to null would read as "never backed up".
      });
    }
  }

  private handleJoinError(error: AgentJoinError): void {
    if (this.state.examEnded) {
      // Should be unreachable now that connect() itself skips emitJoin
      // once the exam has ended — kept as a second layer so no future
      // path that calls emitJoin can regress an already-finished exam
      // back to a join/error screen.
      this.log(`[CẢNH BÁO] Nhận agent:join:error (${error.code}) sau khi thi đã kết thúc — bỏ qua.`);
      return;
    }
    const code = error.code;
    const message = typeof error.message === 'string' ? error.message : '(không có thông tin)';

    if (code === 'NOT_ENROLLED') {
      this.setJoinPhase('access_request_form');
      return;
    }
    if (code === 'RATE_LIMITED') {
      const retryAfterMs = typeof error.retryAfterMs === 'number' ? error.retryAfterMs : 0;
      this.setJoinError('RATE_LIMITED', message, new Date(Date.now() + retryAfterMs).toISOString());
      return;
    }
    if (code === 'SESSION_NOT_ACTIVE') {
      // One patch, not two: joinPhase and joinError must land in the same
      // emitted state, or a listener that reacts to the phase flipping can
      // observe it a tick before the matching error message exists.
      this.patch({ joinPhase: 'session_not_active', joinError: { code, message } });
      return;
    }
    this.setJoinError(code, message);
  }

  private async handleFinalize(payload: ExamFinalizePayload): Promise<void> {
    // Set unconditionally, before either guard below can return early: the
    // server has closed the session the moment this event was sent at all
    // (a duplicate broadcast, or a client-side gap that leaves nothing to
    // upload, included) — from here on `connect`'s own examEnded check is
    // what stops a later reconnect from re-emitting agent:join into a
    // session that will only ever reject it now.
    if (!this.state.examEnded) {
      this.patch({ examEnded: true });
    }
    if (this.finalizing) {
      this.log('Đang nộp bài theo lệnh trước đó — bỏ qua lệnh chốt bài lặp.');
      return;
    }
    if (this.requiredDeliverables.length === 0 || !this.examSessionId || !this.state.studentId) {
      this.log('[CẢNH BÁO] Nhận lệnh chốt bài nhưng chưa có danh sách file bắt buộc — không nộp được gì.');
      return;
    }

    this.finalizing = true;
    this.stopSnapshots?.();
    this.stopSnapshots = null;
    this.patch({ submission: { ...this.state.submission, finalizing: true } });
    const reasonText = payload.reason === 'manual' ? 'giáo viên chốt bài' : 'tự động theo lịch';
    this.notify('Hết giờ thi', `${reasonText}. Đang nộp bài...`);

    try {
      const summary = await uploadAllDeliverables({
        socket: this.socket!,
        examSessionId: this.examSessionId,
        studentId: this.state.studentId,
        deliverables: this.requiredDeliverables,
        readContent: makeWorkspaceReader(this.workspaceDir!),
        log: (message) => this.log(message),
      });
      this.patch({ submission: { finalizing: false, summary } });
      this.notify('Đã nộp bài', formatSummary(summary));
      if (summary.missing > 0 || summary.failed > 0) {
        const stragglers = summary.results
          .filter((r) => r.outcome !== 'uploaded')
          .map((r) => `${r.deliverable.requiredFilename} (${r.reason})`)
          .join(', ');
        this.notify('Còn file chưa nộp được', `${stragglers}. Hãy báo giám thị ngay.`);
      } else {
        // QA-reported gap (point 6): the folder must survive every OTHER
        // event in this app's life — a dropped connection, a reconnect, an
        // exam simply running long — because a student mid-exam has no way
        // to know they're disconnected and would lose unsaved work the
        // moment it's deleted out from under them. The ONLY safe trigger is
        // "every required file is confirmed collected, right here" — never
        // disconnect, never time-up on its own — the socket 'disconnect'
        // handler and quit() elsewhere in this class both deliberately
        // never touch the filesystem, only in-memory/socket state.
        this.removeWorkspaceAfterCollection();
      }
    } catch (error) {
      // uploadAllDeliverables catches every per-deliverable failure itself,
      // so reaching here means something outside the loop broke.
      this.patch({ submission: { ...this.state.submission, finalizing: false } });
      this.log(`Lỗi không mong muốn khi nộp bài: ${describeError(error)}`);
    } finally {
      this.finalizing = false;
    }
  }

  // -------------------------------------------------------------------
  // State/notification plumbing
  // -------------------------------------------------------------------

  private patch(partial: Partial<AgentState>): void {
    this.state = { ...this.state, ...partial };
    this.emit('state', this.state);
  }

  private setJoinPhase(joinPhase: JoinPhase): void {
    this.patch({ joinPhase });
  }

  private setJoinError(code: UiErrorCode, message: string, retryUntil?: string): void {
    const joinPhase: JoinPhase = code === 'RATE_LIMITED' ? 'rate_limited' : 'error';
    this.patch({ joinPhase, joinError: { code, message, retryUntil } });
  }

  private log(message: string): void {
    const entry: LogEntry = { at: new Date().toISOString(), message };
    const log = [...this.state.log, entry].slice(-MAX_LOG_ENTRIES);
    this.patch({ log });
  }

  /** Fires a native notification (via `electron/main`) AND leaves a trace
   *  in the on-screen log — the detail window's log is the durable record
   *  of everything a transient OS toast already said. */
  private notify(title: string, body: string): void {
    this.emit('notify', { title, body } satisfies NotifyEvent);
    this.log(`${title}: ${body}`);
  }

  /**
   * Deletes the student's workspace folder — called ONLY from
   * `handleFinalize`, and only once every required file has already been
   * confirmed uploaded (see the caller). A failure here is a disk-hygiene
   * nit, not a data-loss risk (the submission is already safely on the
   * server by the time this runs), so it never escalates to the student as
   * an error — logged and swallowed.
   */
  private removeWorkspaceAfterCollection(): void {
    if (!this.workspaceDir) return;
    try {
      fs.rmSync(this.workspaceDir, { recursive: true, force: true });
      this.log(`Đã thu bài xong, dọn thư mục làm bài: ${this.workspaceDir}`);
    } catch (error) {
      this.log(`Không dọn được thư mục làm bài (bài đã nộp không bị ảnh hưởng): ${describeError(error)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Small local helpers
// ---------------------------------------------------------------------------

/** The hostname, or undefined if the OS will not say. Never fatal — a
 *  pattern using {SOMAY} renders it as UNKNOWN, which is visible, and a
 *  pattern that does not use it never notices. */
function machineName(): string | undefined {
  try {
    const name = os.hostname().trim();
    return name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeAccessError(code: AccessErrorCode, message: string): string {
  return `${code}: ${message}`;
}
