/**
 * Minimal CLI agent for the exam-live demo.
 *
 * Simulates a real student's machine: connects to the exam-live WebSocket
 * gateway (unauthenticated — agents are public by design, unlike the
 * teacher lobby's cookie-based session), joins an exam session by code, and
 * creates the declared submission files locally, then stays running until the
 * server broadcasts `exam:finalize` — at which point it hashes and uploads
 * every declared deliverable straight to object storage through a presigned
 * URL (the file never passes through the API server, per CLAUDE.md Security
 * rule 5) and confirms each upload back over the socket.
 *
 * Usage:
 *   ts-node src/cli.ts --full-name="Nguyen Van A" --student-id=20120001 --session-code=ABCD12
 *   ts-node src/cli.ts                              (prompts interactively for any value not passed as a flag)
 *
 * Flags:
 *   --full-name=<name>        student's display name (prompted if omitted)
 *   --student-id=<id>         MSSV — also used as the workspace subfolder name (prompted if omitted)
 *   --session-code=<code>     exam session join code (prompted if omitted)
 *   --backend-url=<url>       API base URL (default: http://localhost:4000; also settable via
 *                             the BACKEND_URL env var — the flag wins if both are given)
 *   -h, --help                print usage and exit
 */

import { io, Socket } from 'socket.io-client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import * as os from 'node:os';
import process from 'node:process';
import {
  formatSummary,
  uploadAllDeliverables,
  type ExamFinalizePayload,
  type RequiredDeliverable,
} from './submission-uploader';
import { NoTerminalError, promptAccessRequest, sendAccessRequest } from './access-request';
import { restoreBackup, startSnapshotLoop } from './backup';

// ---------------------------------------------------------------------------
// Client side of the WebSocket Event Contract implemented by
// apps/api/src/exam-session/exam-session.gateway.ts. Do not rename/reshape
// any of this without updating that file's contract comment too.
//
// Exported so src/mock-agent.ts can `import type` these instead of
// re-declaring the same contract shapes — a type-only import, so it never
// pulls in (or executes) this file's runtime code/`main()` call below.
// ---------------------------------------------------------------------------

export interface AgentJoinPayload {
  studentId: string;
  sessionCode: string;
  /**
   * No longer sent on join and ignored if it is: the server answers with the
   * roster name instead of comparing one. Still asked for — once — when a
   * student has no roster row and has to request access, because then there
   * is no authoritative name to fall back on.
   */
  fullName?: string;
  /**
   * This machine's own name, read from the OS.
   *
   * Fills {SOMAY} when the teacher declared a filename pattern that uses
   * it. Read, never asked: CLAUDE.md forbids adding a step for the student,
   * and a seat number they typed would be a value nobody could check. A lab
   * names its machines after their seats, so the hostname is the closest
   * true answer available for free.
   */
  machineName?: string;
}

export interface AgentJoinAck {
  examSessionId: string;
  sessionName: string;
  requiredFiles: string[];
  // Added for the submission phase: every submission event is keyed by
  // requiredDeliverableId, never by filename, so the agent needs the ids
  // as well as the names it writes to disk.
  requiredDeliverables: RequiredDeliverable[];
  // The roster spelling of this student's name, from the server. The name
  // typed into this CLI is not used for identity and is not what comes back
  // here — showing it lets the student catch "wrong MSSV" before the exam
  // rather than after it.
  studentName: string;
  endTime: string;
}

export type AgentJoinErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_ACTIVE'
  | 'INVALID_INPUT'
  | 'NOT_ENROLLED';

export interface AgentJoinError {
  code: AgentJoinErrorCode;
  message: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_BACKEND_URL = 'http://localhost:4000';
const WORKSPACE_DIRNAME = 'exam-workspace';

// Mirrors SAFE_FILENAME_REGEX's character class from
// apps/api/src/exam-session/dto/create-exam-session.dto.ts. That regex
// protects a DIFFERENT trust boundary — it validates what a *teacher* may
// declare when creating a session. This one re-validates what the *server*
// echoes back to THIS process over the wire in `agent:join:ack`. The
// backend having already validated the filename at write time (Task 2),
// and the gateway echoing it back unmodified (Task 3), is not a reason to
// skip re-checking it here: never trust a filename received over the
// network for constructing a filesystem path without re-checking it
// yourself.
const SAFE_FILENAME_CHARSET_REGEX = /^[A-Za-z0-9_.-]+$/;

// Windows treats these as reserved device names REGARDLESS of extension or
// case ("NUL.txt" still resolves to the NUL device, not a file called
// "NUL.txt") — none of them are caught by the checks above (no separator,
// no "..", pure letters/digits), so a required filename equal to one would
// silently write to a device instead of a real file and throw off the
// "created N files" count. Checked defensively on every platform (cheap,
// and keeps behavior identical for a demo that might run partly on
// Windows machines and partly not).
const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  fullName?: string;
  studentId?: string;
  sessionCode?: string;
  backendUrl?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '-h' || token === '--help') {
      args.help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      continue; // ignore stray positional args
    }

    const eqIndex = token.indexOf('=');
    let key: string;
    let value: string | undefined;
    if (eqIndex !== -1) {
      key = token.slice(2, eqIndex);
      value = token.slice(eqIndex + 1);
    } else {
      key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        value = next;
        i++;
      }
    }

    switch (key) {
      case 'full-name':
        args.fullName = value;
        break;
      case 'student-id':
        args.studentId = value;
        break;
      case 'session-code':
        args.sessionCode = value;
        break;
      case 'backend-url':
        args.backendUrl = value;
        break;
      default:
        console.warn(`Cờ không xác định, bỏ qua: --${key}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log(`Agent CLI — kết nối phiên thi và tự tạo file bài nộp.

Cách dùng:
  ts-node src/cli.ts [--full-name="Ho Ten"] [--student-id=MSSV] [--session-code=CODE] [--backend-url=http://localhost:4000]

Bỏ trống bất kỳ giá trị nào để được hỏi trực tiếp trên terminal.
Biến môi trường BACKEND_URL cũng có thể dùng để set backend URL (cờ --backend-url được ưu tiên hơn).`);
}

/** Treats an empty/whitespace-only string as "not provided". */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

async function promptMissing(args: CliArgs): Promise<AgentJoinPayload> {
  // Two questions, not three. The name is the server's to supply.
  const providedStudentId = nonEmpty(args.studentId);
  const providedSessionCode = nonEmpty(args.sessionCode);
  if (providedStudentId && providedSessionCode) {
    // Nothing to ask, so do not open stdin at all. Creating a readline
    // interface starts consuming the stream immediately, which on a piped
    // stdin swallows a line meant for a later prompt — the access-request
    // flow then hung waiting for input that had already been eaten.
    return {
      studentId: providedStudentId,
      sessionCode: providedSessionCode,
      machineName: machineName(),
    };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const studentId = providedStudentId ?? (await askNonEmpty(rl, 'Mã số sinh viên (MSSV): '));
    const sessionCode = providedSessionCode ?? (await askNonEmpty(rl, 'Mã phiên thi: '));
    return { studentId, sessionCode, machineName: machineName() };
  } finally {
    rl.close();
  }
}

/**
 * The hostname, or undefined if the OS will not say. Never fatal — a
 * pattern using {SOMAY} renders it as UNKNOWN, which is visible, and a
 * pattern that does not use it never notices.
 */
function machineName(): string | undefined {
  try {
    return nonEmpty(os.hostname());
  } catch {
    return undefined;
  }
}

async function askNonEmpty(rl: readline.Interface, question: string): Promise<string> {
  // A blank fullName/studentId/sessionCode would fail the backend's own
  // @Length(1, ...) validation anyway (INVALID_INPUT) — catch it locally
  // with a clearer message instead of round-tripping to the server first.
  for (;;) {
    const answer = (await rl.question(question)).trim();
    if (answer.length > 0) {
      return answer;
    }
    console.log('Giá trị không được để trống, vui lòng nhập lại.');
  }
}

// ---------------------------------------------------------------------------
// Path-traversal defense (the core security property this task exists to
// prove). Layered, independently-redundant checks — a regex-only check can
// miss encoding tricks that only surface once the path is actually
// resolved, so the resolved-path prefix check (step 5) is the real
// defense; steps 1-4 exist to fail fast with a specific, readable reason
// before ever touching the filesystem.
// ---------------------------------------------------------------------------

interface FilenameValidationResult {
  ok: boolean;
  reason?: string;
  resolvedPath?: string;
}

function validateFilename(workspaceDir: string, filename: unknown): FilenameValidationResult {
  if (typeof filename !== 'string' || filename.length === 0) {
    return { ok: false, reason: `không phải chuỗi hợp lệ (${JSON.stringify(filename)})` };
  }
  if (filename.includes('/') || filename.includes('\\')) {
    return { ok: false, reason: `chứa dấu phân cách đường dẫn ("/" hoặc "\\"): "${filename}"` };
  }
  if (filename.includes('..')) {
    return { ok: false, reason: `chứa chuỗi ".." (path traversal): "${filename}"` };
  }
  if (!SAFE_FILENAME_CHARSET_REGEX.test(filename)) {
    return {
      ok: false,
      reason: `chứa ký tự không cho phép (chỉ cho phép chữ/số/_/-/.): "${filename}"`,
    };
  }
  // "NUL", "NUL.txt", "com1.py", ... — the part before the first "." is
  // what Windows matches against the reserved device name, case-insensitive.
  if (WINDOWS_RESERVED_DEVICE_NAMES.has(filename.split('.')[0].toLowerCase())) {
    return {
      ok: false,
      reason: `trùng tên thiết bị dành riêng của Windows (CON/PRN/AUX/NUL/COM1-9/LPT1-9): "${filename}"`,
    };
  }

  // THE actual defense: resolve the joined path to an absolute path and
  // confirm it is still strictly inside the resolved workspace directory.
  // Checked independently of the checks above (which could in principle
  // have a gap) via a resolved-path prefix comparison, not a string/regex
  // comparison on the raw filename.
  const resolvedWorkspace = path.resolve(workspaceDir);
  const resolvedTarget = path.resolve(path.join(workspaceDir, filename));
  const requiredPrefix = resolvedWorkspace + path.sep;
  if (!resolvedTarget.startsWith(requiredPrefix)) {
    return {
      ok: false,
      reason: `đường dẫn sau khi resolve nằm ngoài thư mục workspace: "${filename}" -> "${resolvedTarget}"`,
    };
  }

  return { ok: true, resolvedPath: resolvedTarget };
}

/**
 * studentId is LOCAL input (typed by whoever runs this CLI, or piped in
 * from a roster) rather than server-supplied — but it still becomes a
 * directory name (`./exam-workspace/<studentId>/`), so it gets the same
 * allow-list treatment before this process ever touches the filesystem
 * with it.
 */
function isSafeForPathSegment(value: string): boolean {
  return SAFE_FILENAME_CHARSET_REGEX.test(value) && !value.includes('..');
}

/**
 * Same non-object guard the gateway itself uses on the way in
 * (`ExamSessionGateway.isPlainObject`) — applied here on the way back, to
 * `agent:join:ack`/`agent:join:error` payloads, since a malformed or
 * hostile server response is just as untrustworthy as a malformed client
 * request.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Creates `workspaceDir` and, for each entry in `requiredFiles`, an empty
 * file inside it — after independently re-validating the filename (see
 * `validateFilename`). Invalid entries are logged as warnings and skipped,
 * never written, and never crash the process.
 *
 * Uses the `wx` flag (`O_CREAT | O_EXCL`) rather than the default `w`:
 * socket.io reconnects (a network blip, not a fresh exam attempt) cause
 * `connect` to fire again, which re-emits `agent:join` and gets a fresh
 * `agent:join:ack` — this function then runs again for the SAME files. A
 * plain `writeFileSync(path, '')` would silently truncate whatever the
 * student had already written into them. `wx` refuses to write if the
 * path already exists (`EEXIST`), so an existing file — the student's own
 * in-progress work, or a symlink someone planted at that path — is left
 * completely untouched and still counted as "created" (it exists, which
 * is the property this function is actually responsible for). Only a
 * genuinely new required filename results in a new empty file.
 */
function createSubmissionFiles(workspaceDir: string, requiredFiles: unknown): number {
  fs.mkdirSync(workspaceDir, { recursive: true });

  if (!Array.isArray(requiredFiles)) {
    console.warn(
      `[CẢNH BÁO] requiredFiles từ server không phải mảng (${JSON.stringify(requiredFiles)}) — không tạo file nào.`,
    );
    return 0;
  }

  let created = 0;
  for (const filename of requiredFiles) {
    const result = validateFilename(workspaceDir, filename);
    if (!result.ok) {
      console.warn(`[CẢNH BÁO BẢO MẬT] Bỏ qua filename không an toàn — ${result.reason}`);
      continue;
    }
    try {
      fs.writeFileSync(result.resolvedPath!, '', { flag: 'wx' });
      created++;
    } catch (error) {
      if (isErrnoException(error) && error.code === 'EEXIST') {
        // Already exists (rejoin/reconnect, or a prior run) — leave its
        // content alone, still counts toward "sẵn sàng làm bài".
        created++;
        continue;
      }
      console.warn(
        `[CẢNH BÁO] Không thể tạo file "${filename}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return created;
}

/**
 * Reads one deliverable's bytes out of the workspace for upload.
 *
 * Returns null when the file is not there — the student deleted it, or
 * never created it. That is a reportable outcome, not an error: the other
 * deliverables must still be collected (see uploadAllDeliverables).
 *
 * The filename is re-validated here even though createSubmissionFiles
 * already validated it on the way in. The server is not a trusted source
 * for a path at upload time any more than it was at join time, and the ack
 * that produced this list arrived over the same untrusted socket.
 */
function makeWorkspaceReader(workspaceDir: string) {
  return async (deliverable: RequiredDeliverable): Promise<Buffer | null> => {
    const validation = validateFilename(workspaceDir, deliverable.requiredFilename);
    if (!validation.ok) {
      throw new Error(`filename không an toàn — ${validation.reason}`);
    }
    try {
      return await fs.promises.readFile(validation.resolvedPath!);
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const backendUrl = nonEmpty(args.backendUrl) ?? nonEmpty(process.env.BACKEND_URL) ?? DEFAULT_BACKEND_URL;
  const payload = await promptMissing(args);

  if (!isSafeForPathSegment(payload.studentId)) {
    console.error(
      `Mã số sinh viên "${payload.studentId}" chứa ký tự không hợp lệ để dùng làm tên thư mục ` +
        `(chỉ cho phép chữ/số/_/-/., không được chứa "..").`,
    );
    process.exit(1);
  }

  const workspaceDir = path.resolve(process.cwd(), WORKSPACE_DIRNAME, payload.studentId);

  console.log(`Đang kết nối tới ${backendUrl}/exam-live ...`);
  const socket: Socket = io(`${backendUrl}/exam-live`, {
    // No cookie/JWT — agents are public/unauthenticated by design, unlike
    // the teacher lobby (which authenticates via an httpOnly cookie).
    reconnection: true,
  });

  let hasJoinedOnce = false;
  let shuttingDown = false;
  // Captured from `agent:join:ack` and refreshed on every rejoin, so a
  // reconnect mid-exam cannot leave the finalize handler working from a
  // stale deliverable list. `exam:finalize` cannot arrive before a
  // successful join — the server only broadcasts it to the agents room,
  // which this socket joins during agent:join.
  let requiredDeliverables: RequiredDeliverable[] = [];
  // Guards against a reconnect re-prompting a student who is already waiting.
  let requestingAccess = false;
  let examSessionId = "";
  let finalizing = false;
  // One loop for the life of the process, started after the first
  // successful join. A reconnect re-joins and re-acks, and starting a
  // second loop there would double the upload rate for the rest of the exam.
  let stopSnapshots: (() => void) | null = null;

  const shutdown = (exitCode: number): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    socket.removeAllListeners();
    socket.disconnect();
    process.exit(exitCode);
  };

  process.on('SIGINT', () => {
    console.log('\nĐã nhận Ctrl+C, đang ngắt kết nối...');
    shutdown(0);
  });
  process.on('SIGTERM', () => {
    shutdown(0);
  });

  socket.on('connect', () => {
    console.log(`Đã kết nối (socket id: ${socket.id}). Đang tham gia phiên thi...`);
    socket.emit('agent:join', payload);
  });

  socket.on('connect_error', (error: Error) => {
    console.warn(`Không thể kết nối tới ${backendUrl}/exam-live: ${error.message}. Đang thử lại...`);
  });

  socket.on('disconnect', (reason: string) => {
    if (!shuttingDown && hasJoinedOnce) {
      console.warn(`Mất kết nối tới server (${reason}). socket.io sẽ tự động thử kết nối lại...`);
    }
  });

  // The server is not a trusted input source for shape either — a
  // malformed/hostile `agent:join:ack` or `agent:join:error` payload (e.g.
  // `null`, a string, a number) would throw on property access before
  // `main().catch(...)` ever gets a chance to see it, since this runs
  // inside a socket.io event callback, not inside `main`'s own call stack.
  // Guard the shape first, same defense-in-depth stance as the filenames.
  socket.on('agent:join:ack', (ack: unknown) => {
    if (!isPlainObject(ack)) {
      console.warn('[CẢNH BÁO] Server gửi agent:join:ack không hợp lệ (không phải object) — bỏ qua.');
      return;
    }
    void handleJoinAck(ack);
  });

  /**
   * Split out of the listener because a restore has to be awaited, and it
   * has to finish BEFORE the required files are created — see restoreBackup.
   * A socket.io listener cannot await, so the ordering would otherwise be
   * whatever the event loop decided.
   */
  async function handleJoinAck(ack: Record<string, unknown>): Promise<void> {
    hasJoinedOnce = true;
    const sessionName = typeof ack.sessionName === 'string' ? ack.sessionName : '(không rõ)';
    const endTime = typeof ack.endTime === 'string' ? ack.endTime : '(không rõ)';
    const studentName = typeof ack.studentName === 'string' ? ack.studentName : null;
    if (studentName) {
      console.log(`Xác nhận danh tính: ${studentName} (MSSV ${payload.studentId}).`);
      console.log('Nếu KHÔNG phải bạn, hãy thoát ngay và báo giám thị.');
    }
    console.log(`Tham gia thành công: "${sessionName}" (kết thúc lúc ${endTime}).`);
    requiredDeliverables = Array.isArray(ack.requiredDeliverables)
      ? (ack.requiredDeliverables as RequiredDeliverable[])
      : [];
    examSessionId = typeof ack.examSessionId === 'string' ? ack.examSessionId : '';
    // FIRST, before any required file is created. The agent creates those
    // empty, so a restore that ran afterwards would be looking at its own
    // handiwork and would find every file "already there".
    if (ack.backupAvailable === true) {
      console.log('Máy chủ báo có bản sao lưu bài làm của bạn. Đang khôi phục...');
      const outcome = await restoreBackup(socket, workspaceDir);
      if (outcome.status === 'restored') {
        console.log(
          `Đã khôi phục ${outcome.restored} file từ bản sao lưu` +
            (outcome.skipped > 0
              ? ` (giữ nguyên ${outcome.skipped} file bạn đã có sẵn trên máy).`
              : '.'),
        );
      } else if (outcome.status === 'failed') {
        // Not fatal: the student can still sit the exam, they just start
        // from what is on this machine. Said plainly so a technician in the
        // room can decide whether to act.
        console.warn(
          '[CẢNH BÁO] Không tải được bản sao lưu. Bạn vẫn làm bài bình thường — ' +
            'hãy báo giám thị nếu bài làm cũ của bạn bị mất.',
        );
      }
    }

    const createdCount = createSubmissionFiles(workspaceDir, ack.requiredFiles);
    console.log(`Đã tạo ${createdCount} file, sẵn sàng làm bài.`);
    console.log(`Thư mục bài làm: ${workspaceDir}`);

    if (!stopSnapshots) {
      stopSnapshots = startSnapshotLoop(socket, workspaceDir);
      console.log('Bài làm của bạn sẽ được sao lưu tự động vài phút một lần.');
    }

    console.log('Agent đang chạy nền, chờ đến hết giờ thi. Nhấn Ctrl+C để thoát.');
  }

  /**
   * Server -> agent: the exam is over (the scheduled sweep, or the teacher
   * pressing "Chốt bài ngay"). This is the moment the whole agent exists
   * for.
   */
  socket.on('exam:finalize', (finalizePayload: unknown) => {
    if (!isPlainObject(finalizePayload)) {
      console.warn('[CẢNH BÁO] Server gửi exam:finalize không hợp lệ — bỏ qua.');
      return;
    }
    const reason = (finalizePayload as unknown as ExamFinalizePayload).reason;
    if (finalizing) {
      // A duplicate broadcast must never start a second upload loop over
      // the same files while the first one is still running.
      console.log('Đang nộp bài theo lệnh trước đó — bỏ qua lệnh chốt bài lặp.');
      return;
    }
    if (requiredDeliverables.length === 0 || !examSessionId) {
      console.warn(
        '[CẢNH BÁO] Nhận lệnh chốt bài nhưng chưa có danh sách file bắt buộc — không nộp được gì.',
      );
      return;
    }

    finalizing = true;
    // The snapshot exists to survive the exam, not to outlast it. Stopped
    // here so a timer cannot fire mid-upload and compete with the real
    // submission for the same lab network.
    stopSnapshots?.();
    stopSnapshots = null;
    const reasonText = reason === 'manual' ? 'giáo viên chốt bài' : 'tự động theo lịch';
    console.log(`\nHết giờ thi (${reasonText}). Đang nộp bài...`);

    void uploadAllDeliverables({
      socket,
      examSessionId,
      studentId: payload.studentId,
      deliverables: requiredDeliverables,
      readContent: makeWorkspaceReader(workspaceDir),
      log: (message) => console.log(message),
    })
      .then((summary) => {
        console.log(formatSummary(summary));
        if (summary.missing > 0 || summary.failed > 0) {
          const stragglers = summary.results
            .filter((r) => r.outcome !== 'uploaded')
            .map((r) => `${r.deliverable.requiredFilename} (${r.reason})`)
            .join(', ');
          console.log(`Các file chưa nộp được: ${stragglers}`);
          console.log('Hãy báo giám thị ngay nếu còn file bắt buộc chưa nộp được.');
        }
        console.log('Agent vẫn đang chạy. Nhấn Ctrl+C để thoát.');
      })
      .catch((error: unknown) => {
        // uploadAllDeliverables catches every per-deliverable failure
        // itself, so reaching here means something outside the loop broke.
        // It must never become an unhandled rejection that kills the
        // process at the exact moment the student needs it alive.
        console.error(
          'Lỗi không mong muốn khi nộp bài:',
          error instanceof Error ? error.message : error,
        );
      })
      .finally(() => {
        // Cleared so a later finalize (a rejoin, or a manual chốt after a
        // scheduled one) can retry whatever did not make it.
        finalizing = false;
      });
  });

  socket.on('agent:join:error', (error: unknown) => {
    if (!isPlainObject(error)) {
      console.error('[CẢNH BÁO] Server gửi agent:join:error không hợp lệ (không phải object).');
      shutdown(1);
      return;
    }
    const code = typeof error.code === 'string' ? error.code : 'UNKNOWN';
    const message = typeof error.message === 'string' ? error.message : '(không có thông tin)';

    // The one refusal that is not the end of the road. Everything else here
    // is a wrong code or a closed session, which no invigilator can wave
    // through; not being on the roster is a records problem, and a records
    // problem must not cost a student their exam.
    if (code === 'NOT_ENROLLED' && !requestingAccess) {
      requestingAccess = true;
      void requestAccess();
      return;
    }

    console.error(`Lỗi tham gia phiên thi [${code}]: ${message}`);
    shutdown(1);
  });

  async function requestAccess(): Promise<void> {
    try {
      const { fullName, reason } = await promptAccessRequest(payload.studentId);
      const ack = await sendAccessRequest(socket, {
        sessionCode: payload.sessionCode,
        studentId: payload.studentId,
        fullName,
        reason,
      });
      if (!ack.ok) {
        // ALREADY_ENROLLED means the roster gained them between the refusal
        // and the request — retrying the join is the right move, not an error.
        if (ack.code === 'ALREADY_ENROLLED') {
          console.log('Bạn đã có trong danh sách. Đang thử tham gia lại...');
          requestingAccess = false;
          socket.emit('agent:join', payload);
          return;
        }
        console.error(`Không gửi được yêu cầu [${ack.code}]: ${ack.message}`);
        shutdown(1);
        return;
      }
      console.log('');
      console.log('Đã gửi yêu cầu. Đang chờ giảng viên duyệt — KHÔNG tắt cửa sổ này.');
      console.log('Nếu chờ quá lâu, hãy báo trực tiếp với giám thị trong phòng.');
    } catch (error) {
      if (error instanceof NoTerminalError) {
        console.error('');
        console.error(`MSSV ${payload.studentId} không có trong danh sách lớp của môn thi này.`);
        console.error('Agent đang chạy không có terminal nên không hỏi được thông tin.');
        console.error('Hãy chạy agent trực tiếp trong cửa sổ lệnh, hoặc báo giám thị.');
        shutdown(1);
        return;
      }
      console.error(
        'Không gửi được yêu cầu:',
        error instanceof Error ? error.message : error,
      );
      shutdown(1);
    }
  }

  socket.on('agent:access-granted', () => {
    console.log('Giảng viên đã duyệt. Đang vào phòng thi...');
    requestingAccess = false;
    // Re-join rather than having the server fake an ack: the same path every
    // other student takes, so nothing about this student is special from here on.
    socket.emit('agent:join', payload);
  });

  socket.on('agent:access-denied', (body: unknown) => {
    const message =
      isPlainObject(body) && typeof body.message === 'string'
        ? body.message
        : 'Giảng viên đã từ chối yêu cầu.';
    console.error(message);
    console.error('Hãy liên hệ giám thị trong phòng thi.');
    shutdown(1);
  });
}

main().catch((error) => {
  console.error('Lỗi không mong muốn:', error instanceof Error ? error.message : error);
  process.exit(1);
});
