/**
 * Mock agent — load-test harness for the exam-live demo.
 *
 * Opens N concurrent WebSocket connections to the exam-live gateway
 * (`Promise.all` over N independent connect+join attempts, never a serial
 * await-in-a-loop), each with a distinct generated (never real) identity,
 * all joining the same session code. Reports aggregate success/failure
 * counts and average time-to-ack, so a teacher/dev can functional- and
 * basic-load-test the join flow and the lobby page without gathering N
 * real students.
 *
 * Deliberately lighter than the real agent (src/cli.ts): no filesystem
 * writes (never touches `exam-workspace/`), no interactive prompts, no
 * reconnection loop — built for throughput and aggregate reporting, not
 * for fidelity to what a real exam-taking machine does.
 *
 * Usage:
 *   ts-node src/mock-agent.ts --session <code> [--count <n>] [--keep-alive] [--backend-url <url>]
 *   ts-node src/mock-agent.ts --session ABCD12 --count 50
 *
 * Flags:
 *   --session <code>      exam session join code (required)
 *   --count <n>           number of simulated agents to connect (default: 10)
 *   --keep-alive           keep every successfully-joined socket connected
 *                          after the summary is printed, instead of
 *                          disconnecting it right away (default: disconnect
 *                          every socket immediately after its ack/error —
 *                          fast test mode, also exercises the gateway's
 *                          `agent:disconnected` broadcast for each one)
 *   --backend-url <url>   API base URL (default: http://localhost:4000;
 *                         also settable via the BACKEND_URL env var — the
 *                         flag wins if both are given)
 *   -h, --help             print usage and exit
 */

import { io, Socket } from 'socket.io-client';
import process from 'node:process';

// ---------------------------------------------------------------------------
// Client side of the WebSocket Event Contract implemented by
// apps/api/src/exam-session/exam-session.gateway.ts. `import type` only —
// erased at compile time, so this never executes src/cli.ts's module-level
// `main().catch(...)` side effect. Do not rename/reshape any of this
// without updating that file's contract comment too.
// ---------------------------------------------------------------------------

import type { AgentJoinPayload, AgentJoinAck, AgentJoinErrorCode, AgentJoinError } from './cli';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_BACKEND_URL = 'http://localhost:4000';
const DEFAULT_COUNT = 10;

// Safety net only — the manual test suite for this task confirms the real
// gateway always answers `agent:join` with either `agent:join:ack` or
// `agent:join:error` (even for a bogus session code), so this should never
// fire in practice. It exists so a genuine server-side hang can't leave
// `Promise.all` (and this whole process) stuck forever — it surfaces as a
// `CLIENT_TIMEOUT` failure in the aggregate report instead, which is itself
// a useful signal.
const JOIN_TIMEOUT_MS = 15_000;

/** Locally-synthesized failure reasons, alongside the server's own AgentJoinErrorCode values. */
type LocalFailureCode = 'CONNECT_ERROR' | 'CLIENT_TIMEOUT' | 'INVALID_RESPONSE';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

interface MockAgentArgs {
  sessionCode?: string;
  count: number;
  keepAlive: boolean;
  backendUrl?: string;
  help: boolean;
}

/** Treats an empty/whitespace-only string as "not provided". */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function printUsage(): void {
  console.log(`Mock Agent — mở nhiều kết nối agent song song để test tải/chức năng.

Cách dùng:
  ts-node src/mock-agent.ts --session <code> [--count <n>] [--keep-alive] [--backend-url <url>]

Cờ:
  --session <code>       Mã phiên thi cần tham gia (bắt buộc).
  --count <n>            Số agent giả lập mở song song, mặc định ${DEFAULT_COUNT}.
  --keep-alive            Giữ kết nối các agent tham gia THÀNH CÔNG sau khi in báo cáo
                          (mặc định: ngắt kết nối mọi socket ngay khi nhận ack/error).
  --backend-url <url>    URL API backend, mặc định ${DEFAULT_BACKEND_URL}
                          (cũng có thể set qua biến môi trường BACKEND_URL).
  -h, --help              In hướng dẫn này rồi thoát.

Danh tính agent được SINH TỰ ĐỘNG, KHÔNG dùng MSSV thật:
  "Sinh viên test 01" / "MSSV_TEST_01", tăng dần theo --count.`);
}

function parseArgs(argv: string[]): MockAgentArgs {
  let sessionCode: string | undefined;
  let countRaw: string | undefined;
  let backendUrl: string | undefined;
  let keepAlive = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '-h' || token === '--help') {
      help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      console.warn(`Tham số không xác định, bỏ qua: "${token}"`);
      continue;
    }

    const eqIndex = token.indexOf('=');
    const key = eqIndex !== -1 ? token.slice(2, eqIndex) : token.slice(2);
    const inlineValue = eqIndex !== -1 ? token.slice(eqIndex + 1) : undefined;

    // --keep-alive is a pure boolean flag — it must NOT consume the next
    // token as a value (unlike --session/--count/--backend-url below),
    // otherwise `--keep-alive --count 5` would silently eat "--count".
    if (key === 'keep-alive') {
      keepAlive = inlineValue === undefined ? true : inlineValue !== 'false';
      continue;
    }

    let value = inlineValue;
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        console.error(`Cờ --${key} cần một giá trị.`);
        process.exit(1);
      }
      value = next;
      i++;
    }

    switch (key) {
      case 'session':
        sessionCode = value;
        break;
      case 'count':
        countRaw = value;
        break;
      case 'backend-url':
        backendUrl = value;
        break;
      default:
        console.warn(`Cờ không xác định, bỏ qua: --${key}`);
    }
  }

  const count = countRaw !== undefined ? Number.parseInt(countRaw, 10) : DEFAULT_COUNT;
  if (!Number.isInteger(count) || count <= 0) {
    console.error(`--count phải là số nguyên dương, nhận được: "${countRaw}"`);
    process.exit(1);
  }

  return { sessionCode: nonEmpty(sessionCode), count, keepAlive, backendUrl: nonEmpty(backendUrl), help };
}

// ---------------------------------------------------------------------------
// Fake identity generation — NEVER real MSSV data.
// ---------------------------------------------------------------------------

interface MockIdentity {
  fullName: string;
  studentId: string;
}

function generateIdentities(count: number): MockIdentity[] {
  // Width grows with `count` so e.g. --count 150 still zero-pads
  // consistently ("001".."150") instead of losing sort order at "099"/"100".
  const width = Math.max(2, String(count).length);
  const identities: MockIdentity[] = [];
  for (let i = 1; i <= count; i++) {
    const suffix = String(i).padStart(width, '0');
    identities.push({
      fullName: `Sinh viên test ${suffix}`,
      studentId: `MSSV_TEST_${suffix}`,
    });
  }
  return identities;
}

// ---------------------------------------------------------------------------
// Per-agent connect + join
// ---------------------------------------------------------------------------

/**
 * Same non-object guard the gateway itself uses on the way in
 * (`ExamSessionGateway.isPlainObject`) and the real agent uses on the way
 * back (`cli.ts`'s own `isPlainObject`) — applied here too, since a
 * malformed/hostile `agent:join:ack`/`agent:join:error` payload is just as
 * untrustworthy for this script as for the real one. Re-declared locally
 * (not imported) because it's a runtime value, not a type — importing a
 * value from cli.ts would execute that file's module-level `main()` call.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface AgentOutcome {
  index: number;
  identity: MockIdentity;
  status: 'success' | 'error';
  /** Time from emitting `agent:join` to receiving ack/error, in ms. */
  timeToAckMs: number;
  /** Time from opening the socket to settling, in ms — includes connection setup, used to evidence real concurrency (see report). */
  totalMs: number;
  errorCode?: AgentJoinErrorCode | LocalFailureCode;
  errorMessage?: string;
  ack?: AgentJoinAck;
  /** Set only when this connection stays open after settling (successful join + --keep-alive). */
  keptAliveSocket?: Socket;
}

function runOneAgent(
  index: number,
  total: number,
  identity: MockIdentity,
  sessionCode: string,
  backendUrl: string,
  keepAlive: boolean,
): Promise<AgentOutcome> {
  return new Promise((resolve) => {
    const openedAt = Date.now();
    let emitStart = 0;
    let settled = false;

    // forceNew: true is essential here, not decorative — without it,
    // socket.io-client multiplexes same-URL connections over one shared
    // Manager/transport, which would NOT exercise N genuinely separate
    // socket connections (N distinct server-side client.id values, N
    // separate per-socket rate-limit buckets, N separate
    // `agent:disconnected` broadcasts). reconnection: false means one
    // connection attempt, one outcome — no silent background retries that
    // would re-emit agent:join and skew the rate-limit/attempt counts.
    const socket: Socket = io(`${backendUrl}/exam-live`, {
      forceNew: true,
      reconnection: false,
      timeout: JOIN_TIMEOUT_MS,
    });

    const safetyTimer = setTimeout(() => {
      settle({
        status: 'error',
        errorCode: 'CLIENT_TIMEOUT',
        errorMessage: `Không nhận được agent:join:ack/error trong ${JOIN_TIMEOUT_MS}ms.`,
      });
    }, JOIN_TIMEOUT_MS);

    function cleanupListeners(): void {
      clearTimeout(safetyTimer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('agent:join:ack', onAck);
      socket.off('agent:join:error', onError);
    }

    function settle(partial: {
      status: 'success' | 'error';
      errorCode?: AgentJoinErrorCode | LocalFailureCode;
      errorMessage?: string;
      ack?: AgentJoinAck;
    }): void {
      if (settled) {
        return;
      }
      settled = true;
      cleanupListeners();

      const now = Date.now();
      const timeToAckMs = emitStart > 0 ? now - emitStart : now - openedAt;
      const totalMs = now - openedAt;

      const staysConnected = keepAlive && partial.status === 'success';
      if (!staysConnected) {
        socket.disconnect();
      }

      const tag = `[${String(index).padStart(String(total).length, '0')}/${total}]`;
      if (partial.status === 'success') {
        console.log(`${tag} ${identity.studentId} OK (${timeToAckMs}ms)`);
      } else {
        console.log(`${tag} ${identity.studentId} LỖI ${partial.errorCode ?? 'UNKNOWN'} (${timeToAckMs}ms) — ${partial.errorMessage ?? ''}`);
      }

      resolve({
        index,
        identity,
        status: partial.status,
        timeToAckMs,
        totalMs,
        errorCode: partial.errorCode,
        errorMessage: partial.errorMessage,
        ack: partial.ack,
        keptAliveSocket: staysConnected ? socket : undefined,
      });
    }

    function onConnect(): void {
      emitStart = Date.now();
      const payload: AgentJoinPayload = {
        fullName: identity.fullName,
        studentId: identity.studentId,
        sessionCode,
      };
      socket.emit('agent:join', payload);
    }

    function onConnectError(error: Error): void {
      settle({ status: 'error', errorCode: 'CONNECT_ERROR', errorMessage: error.message });
    }

    // The server is not a trusted input source for shape either — same
    // defense-in-depth stance as cli.ts's own ack/error handlers.
    function onAck(ack: unknown): void {
      if (!isPlainObject(ack)) {
        settle({ status: 'error', errorCode: 'INVALID_RESPONSE', errorMessage: 'agent:join:ack không phải object.' });
        return;
      }
      settle({ status: 'success', ack: ack as unknown as AgentJoinAck });
    }

    function onError(error: unknown): void {
      if (!isPlainObject(error)) {
        settle({ status: 'error', errorCode: 'INVALID_RESPONSE', errorMessage: 'agent:join:error không phải object.' });
        return;
      }
      const typed = error as Partial<AgentJoinError>;
      const code = typeof typed.code === 'string' ? (typed.code as AgentJoinErrorCode) : undefined;
      const message = typeof typed.message === 'string' ? typed.message : '(không có thông tin)';
      settle({ status: 'error', errorCode: code, errorMessage: message });
    }

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('agent:join:ack', onAck);
    socket.on('agent:join:error', onError);
  });
}

// ---------------------------------------------------------------------------
// Aggregate reporting
// ---------------------------------------------------------------------------

function printSummary(outcomes: AgentOutcome[], batchElapsedMs: number, sessionCode: string, keepAlive: boolean): void {
  const successes = outcomes.filter((o) => o.status === 'success');
  const failures = outcomes.filter((o) => o.status === 'error');
  const avgTimeToAckMs =
    successes.length > 0 ? successes.reduce((sum, o) => sum + o.timeToAckMs, 0) / successes.length : null;

  const byErrorCode = new Map<string, number>();
  for (const f of failures) {
    const key = f.errorCode ?? 'UNKNOWN';
    byErrorCode.set(key, (byErrorCode.get(key) ?? 0) + 1);
  }

  console.log('');
  console.log('=== Kết quả tổng hợp mock-agent ===');
  console.log(`Session code: ${sessionCode}`);
  console.log(`Số agent yêu cầu: ${outcomes.length}`);
  console.log(`Thành công (agent:join:ack): ${successes.length}`);
  console.log(`Thất bại (agent:join:error / lỗi kết nối): ${failures.length}`);
  if (byErrorCode.size > 0) {
    console.log('  Chi tiết theo mã lỗi:');
    for (const [code, count] of byErrorCode) {
      console.log(`    ${code}: ${count}`);
    }
  }
  console.log(
    avgTimeToAckMs !== null
      ? `Thời gian trung bình từ emit đến ack (chỉ tính join thành công): ${avgTimeToAckMs.toFixed(2)} ms`
      : 'Thời gian trung bình từ emit đến ack: N/A (không có join nào thành công)',
  );
  console.log(`Tổng thời gian chạy song song (Promise.all, ${outcomes.length} kết nối): ${batchElapsedMs}ms`);
  console.log(
    `Chế độ keep-alive: ${keepAlive ? 'BẬT (giữ kết nối các agent đã join thành công)' : 'TẮT (đã ngắt kết nối tất cả sau khi nhận ack/error)'}`,
  );
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

  if (!args.sessionCode) {
    console.error('Thiếu --session <code>.');
    printUsage();
    process.exit(1);
  }

  const backendUrl = args.backendUrl ?? nonEmpty(process.env.BACKEND_URL) ?? DEFAULT_BACKEND_URL;
  const identities = generateIdentities(args.count);
  const sessionCode = args.sessionCode;

  console.log(
    `Mock agent: mở ${args.count} kết nối song song tới ${backendUrl}/exam-live, tham gia phiên thi "${sessionCode}" (keep-alive: ${args.keepAlive ? 'bật' : 'tắt'}).`,
  );
  console.log('');

  const batchStart = Date.now();
  const outcomes = await Promise.all(
    identities.map((identity, i) => runOneAgent(i + 1, identities.length, identity, sessionCode, backendUrl, args.keepAlive)),
  );
  const batchElapsedMs = Date.now() - batchStart;

  printSummary(outcomes, batchElapsedMs, sessionCode, args.keepAlive);

  if (!args.keepAlive) {
    // Every socket was already disconnected inside settle() as each
    // outcome resolved — nothing left holding the event loop open. The
    // explicit exit is a safety net, not a workaround for a leak.
    process.exit(0);
    return;
  }

  const keptSockets = outcomes.map((o) => o.keptAliveSocket).filter((s): s is Socket => s !== undefined);
  console.log('');
  console.log(
    `${keptSockets.length} kết nối đang được GIỮ SỐNG (khớp với số join thành công) — mở trang lobby để xem, nhấn Ctrl+C để ngắt tất cả và thoát.`,
  );

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`\nĐang ngắt kết nối ${keptSockets.length} agent đang giữ sống...`);
    for (const socket of keptSockets) {
      socket.disconnect();
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Lỗi không mong muốn:', error instanceof Error ? error.message : error);
  process.exit(1);
});
