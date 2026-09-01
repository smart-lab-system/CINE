import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { Server as SocketIoServer, type Namespace, type Socket as ServerSocket } from 'socket.io';
import { SessionController, type AgentState } from './session-controller';
import type { AgentJoinAck, AgentJoinError } from './agent-contract';

/**
 * Drives SessionController against a REAL socket.io server — no
 * mocked socket, same "no Electron needed" testability the design spec
 * promises for this file (§9), scaled to sockets the way
 * snapshot.test.ts scales it to the filesystem.
 *
 * The fake server implements just enough of the `/exam-live` contract to
 * exercise every join-screen state (spec §4's table) plus finalize: what
 * `agent:join` replies with is fully test-controlled via `nextJoinReply`,
 * and a tiny plain-HTTP route stands in for the presigned PUT target
 * `submission:request-upload-url` points at.
 */

let httpServer: http.Server;
let io: SocketIoServer;
let ns: Namespace;
let baseUrl: string;
let uploadedBodies: Buffer[] = [];

type JoinReply = { type: 'ack'; ack: Partial<AgentJoinAck> } | { type: 'error'; error: AgentJoinError };
let nextJoinReply: JoinReply | null = null;
let joinAttemptCount = 0;

function baseAck(overrides: Partial<AgentJoinAck> = {}): AgentJoinAck {
  return {
    examSessionId: 'exam-1',
    sessionName: 'Thi cuối kỳ Lập trình Web',
    requiredFiles: ['Cau1.docx'],
    requiredDeliverables: [{ id: 'd1', requiredFilename: 'Cau1.docx', deliverableType: 'document' }],
    studentName: 'Nguyễn Văn A',
    endTime: new Date(Date.now() + 3_600_000).toISOString(),
    examMaterialCount: 0,
    materialsReleaseAt: new Date().toISOString(),
    backupAvailable: false,
    ...overrides,
  };
}

beforeAll(async () => {
  httpServer = http.createServer((req, res) => {
    if (req.method === 'PUT' && req.url?.startsWith('/fake-storage/')) {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        uploadedBodies.push(Buffer.concat(chunks));
        res.writeHead(200);
        res.end();
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  io = new SocketIoServer(httpServer, { path: '/socket.io/' });
  ns = io.of('/exam-live');

  ns.on('connection', (socket: ServerSocket) => {
    socket.on('agent:join', () => {
      joinAttemptCount++;
      const reply = nextJoinReply;
      if (!reply) {
        socket.emit('agent:join:error', { code: 'SESSION_NOT_FOUND', message: 'no reply configured' });
        return;
      }
      if (reply.type === 'ack') {
        socket.emit('agent:join:ack', baseAck(reply.ack));
      } else {
        socket.emit('agent:join:error', reply.error);
      }
    });

    socket.on(
      'agent:request-access',
      (_payload: unknown, ack: (reply: { ok: boolean; requestId?: string; code?: string; message?: string }) => void) => {
        ack(accessRequestReply);
      },
    );

    socket.on(
      'submission:request-upload-url',
      (
        payload: { requiredDeliverableId: string },
        ack: (reply: { ok: true; uploadUrl: string; storageKey: string; expiresIn: number }) => void,
      ) => {
        ack({
          ok: true,
          uploadUrl: `${baseUrl}/fake-storage/${payload.requiredDeliverableId}`,
          storageKey: `key-${payload.requiredDeliverableId}`,
          expiresIn: 60,
        });
      },
    );

    socket.on(
      'submission:confirm',
      (_payload: unknown, ack: (reply: { ok: true; status: string; submittedAt: string }) => void) => {
        ack({ ok: true, status: 'submitted', submittedAt: new Date().toISOString() });
      },
    );
  });

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

let accessRequestReply: { ok: boolean; requestId?: string; code?: string; message?: string } = {
  ok: true,
  requestId: 'req-1',
};

afterEach(() => {
  nextJoinReply = null;
  uploadedBodies = [];
  joinAttemptCount = 0;
  accessRequestReply = { ok: true, requestId: 'req-1' };
});

function tmpWorkspaceRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'examcollect-session-controller-'));
}

function waitForState(
  controller: SessionController,
  predicate: (state: AgentState) => boolean,
  timeoutMs = 5000,
): Promise<AgentState> {
  return new Promise((resolve, reject) => {
    if (predicate(controller.getState())) {
      resolve(controller.getState());
      return;
    }
    const timer = setTimeout(() => {
      controller.off('state', onState);
      reject(new Error(`timed out waiting for state; last state: ${JSON.stringify(controller.getState())}`));
    }, timeoutMs);
    const onState = (state: AgentState): void => {
      if (predicate(state)) {
        clearTimeout(timer);
        controller.off('state', onState);
        resolve(state);
      }
    };
    controller.on('state', onState);
  });
}

/** For asserting on something outside SessionController's own `state`
 *  events entirely (here: a count the fake server keeps) — `waitForState`
 *  only ever resolves the instant the CLIENT patches, which can land
 *  before an emit it just sent has actually reached and been processed by
 *  the server. Polling, not racing a single push, is what closes that gap. */
async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('SessionController — join flow (design spec §4)', () => {
  it('emits the default form state on its own, before any command — the renderer has nothing else to render from', async () => {
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });
    // A listener attached synchronously, right after construction — the
    // exact shape of what electron/main/index.ts's wireController() does.
    // getState() alone can't catch a regression here (it trivially
    // returns the right default either way); this asserts the 'state'
    // EVENT itself actually fires, unprompted. A regression means the
    // renderer's join form never appears on a fresh launch: nothing else
    // ever prompts this class to emit until the student calls join(),
    // which they cannot do on a blank window.
    let emitted: AgentState | null = null;
    controller.on('state', (state) => {
      emitted = state;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(emitted).not.toBeNull();
    const state = emitted!;
    expect(state).toEqual({
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
    });
    controller.quit();
  });

  it('state a -> b -> c: a successful join reaches "joined" with the roster name and a checklist', async () => {
    nextJoinReply = { type: 'ack', ack: {} };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });

    controller.join({ studentId: 'SV20120001', sessionCode: 'ABC123' });
    // joinPhase flips to 'joined' immediately (so the UI confirms fast);
    // the checklist fills in moments later via a separate patch, once
    // backup/file-creation finish — wait for that, not just the phase.
    const state = await waitForState(controller, (s) => s.joinPhase === 'joined' && s.requiredFiles.length > 0);

    expect(state.studentName).toBe('Nguyễn Văn A');
    expect(state.sessionName).toBe('Thi cuối kỳ Lập trình Web');
    expect(state.confirmedAt).not.toBeNull();
    expect(state.requiredFiles).toEqual([{ filename: 'Cau1.docx', created: true }]);

    controller.quit();
  });

  it('state d: SESSION_NOT_FOUND lands on "error", not a crash', async () => {
    nextJoinReply = { type: 'error', error: { code: 'SESSION_NOT_FOUND', message: 'No exam session matches this code.' } };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });

    controller.join({ studentId: 'SV20120001', sessionCode: 'ZZZZZZ' });
    const state = await waitForState(controller, (s) => s.joinPhase === 'error');

    expect(state.joinError?.code).toBe('SESSION_NOT_FOUND');
    controller.quit();
  });

  it('group 1b: a connection that never succeeds shows connect_error, not a plain error, before the first join', async () => {
    // A port nothing is listening on — the request fails locally
    // (ECONNREFUSED), no real network flakiness needed for this to be
    // deterministic.
    const controller = new SessionController({
      backendUrl: 'http://127.0.0.1:1',
      workspaceRoot: tmpWorkspaceRoot(),
    });

    controller.join({ studentId: 'SV20120001', sessionCode: 'ABC123' });
    const state = await waitForState(controller, (s) => s.joinPhase === 'connect_error', 10_000);

    expect(state.connection).toBe('connect_error');
    controller.quit();
  }, 15_000);

  it('rejects an unsafe studentId locally, before ever touching the network', async () => {
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });

    controller.join({ studentId: '../etc', sessionCode: 'ABC123' });

    expect(controller.getState().joinPhase).toBe('error');
    expect(controller.getState().joinError?.code).toBe('INVALID_INPUT');
    expect(controller.getState().connection).toBe('idle'); // never even connected
    controller.quit();
  });

  it('state d2: RATE_LIMITED carries an absolute retryUntil derived from the server-sent retryAfterMs', async () => {
    nextJoinReply = {
      type: 'error',
      error: { code: 'RATE_LIMITED', message: 'Quá nhiều lần thử sai.', retryAfterMs: 300_000 },
    };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });
    const before = Date.now();

    controller.join({ studentId: 'SV20120001', sessionCode: 'ABC123' });
    const state = await waitForState(controller, (s) => s.joinPhase === 'rate_limited');

    expect(state.joinError?.code).toBe('RATE_LIMITED');
    const retryUntil = new Date(state.joinError!.retryUntil!).getTime();
    expect(retryUntil).toBeGreaterThan(before + 290_000);
    expect(retryUntil).toBeLessThanOrEqual(before + 305_000);
    controller.quit();
  });

  it('state e: SESSION_NOT_ACTIVE has its own phase, distinct from a plain error', async () => {
    nextJoinReply = { type: 'error', error: { code: 'SESSION_NOT_ACTIVE', message: 'not open yet' } };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });

    controller.join({ studentId: 'SV20120001', sessionCode: 'ABC123' });
    const state = await waitForState(controller, (s) => s.joinPhase === 'session_not_active');

    expect(state.joinError?.code).toBe('SESSION_NOT_ACTIVE');
    controller.quit();
  });

  it('state f -> g -> c: NOT_ENROLLED opens the access-request form; a successful request waits; a grant re-joins', async () => {
    nextJoinReply = { type: 'error', error: { code: 'NOT_ENROLLED', message: 'not on the roster' } };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });

    controller.join({ studentId: 'SV20129999', sessionCode: 'ABC123' });
    await waitForState(controller, (s) => s.joinPhase === 'access_request_form');

    accessRequestReply = { ok: true, requestId: 'req-42' };
    controller.sendAccessRequest({ fullName: 'Người Lạ', reason: 'Thi bù' });
    await waitForState(controller, (s) => s.joinPhase === 'access_request_pending');

    // The invigilator approves — server broadcasts agent:access-granted to
    // this socket specifically.
    nextJoinReply = { type: 'ack', ack: {} };
    const socket = [...ns.sockets.values()][ns.sockets.size - 1];
    socket.emit('agent:access-granted');

    const state = await waitForState(controller, (s) => s.joinPhase === 'joined');
    expect(state.studentName).toBe('Nguyễn Văn A');
    controller.quit();
  });

  it('ALREADY_ENROLLED from the access-request ack retries the join automatically', async () => {
    nextJoinReply = { type: 'error', error: { code: 'NOT_ENROLLED', message: 'not on the roster' } };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });

    controller.join({ studentId: 'SV20129999', sessionCode: 'ABC123' });
    await waitForState(controller, (s) => s.joinPhase === 'access_request_form');

    accessRequestReply = { ok: false, code: 'ALREADY_ENROLLED', message: 'already enrolled by now' };
    nextJoinReply = { type: 'ack', ack: {} }; // what the auto-retry should hit
    controller.sendAccessRequest({ fullName: 'Người Lạ', reason: 'Thi bù' });

    const state = await waitForState(controller, (s) => s.joinPhase === 'joined');
    expect(state.studentName).toBe('Nguyễn Văn A');
    controller.quit();
  });

  it('agent:access-denied lands on error with a client-only ACCESS_DENIED code', async () => {
    nextJoinReply = { type: 'error', error: { code: 'NOT_ENROLLED', message: 'not on the roster' } };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });

    controller.join({ studentId: 'SV20129999', sessionCode: 'ABC123' });
    await waitForState(controller, (s) => s.joinPhase === 'access_request_form');
    controller.sendAccessRequest({ fullName: 'Người Lạ', reason: 'Thi bù' });
    await waitForState(controller, (s) => s.joinPhase === 'access_request_pending');

    const socket = [...ns.sockets.values()][ns.sockets.size - 1];
    socket.emit('agent:access-denied', { message: 'Không đủ điều kiện.' });

    const state = await waitForState(controller, (s) => s.joinPhase === 'error');
    expect(state.joinError?.code).toBe('ACCESS_DENIED');
    expect(state.joinError?.message).toBe('Không đủ điều kiện.');
    controller.quit();
  });
});

describe('SessionController — after joining', () => {
  it('a reconnect does not recreate a required file the student has since renamed away — QA-reported bug', async () => {
    nextJoinReply = { type: 'ack', ack: {} };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });
    controller.join({ studentId: 'SV20120001', sessionCode: 'ABC123' });
    const joined = await waitForState(controller, (s) => s.joinPhase === 'joined' && s.requiredFiles.length > 0);
    const workspaceDir = controllerWorkspaceDir(controller);
    expect(joined.requiredFiles).toEqual([{ filename: 'Cau1.docx', created: true }]);

    // The student renames their required file to something else, WITH
    // real content in it — exactly the QA repro: before the fix, a
    // reconnect's `createSubmissionFiles` re-runs unconditionally and
    // creates a fresh EMPTY Cau1.docx back at the original path, which
    // `submission:confirm` then uploads at finalize as a "successful"
    // 0-byte submission — while the student's real, renamed file is
    // never touched or submitted at all.
    fs.writeFileSync(path.join(workspaceDir, 'Cau1.docx'), 'bai lam that cua sinh vien');
    fs.renameSync(path.join(workspaceDir, 'Cau1.docx'), path.join(workspaceDir, 'Cau1_final.docx'));

    const serverSocket = [...ns.sockets.values()][ns.sockets.size - 1];
    serverSocket.conn.close();
    await waitForState(controller, (s) => s.connection === 'disconnected');
    await waitForState(controller, (s) => s.connection === 'connected', 10_000);
    await waitFor(() => joinAttemptCount === 2, 5000); // the rejoin actually happened

    expect(fs.existsSync(path.join(workspaceDir, 'Cau1.docx'))).toBe(false); // not recreated
    expect(fs.readFileSync(path.join(workspaceDir, 'Cau1_final.docx'), 'utf8')).toBe(
      'bai lam that cua sinh vien',
    ); // the student's real work is exactly as they left it
    controller.quit();
  }, 15_000);

  it('re-emits agent:join automatically after a network blip, without the student resubmitting the form', async () => {
    nextJoinReply = { type: 'ack', ack: {} };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });
    controller.join({ studentId: 'SV20120001', sessionCode: 'ABC123' });
    await waitForState(controller, (s) => s.joinPhase === 'joined');
    expect(joinAttemptCount).toBe(1);

    // socket.conn.close() (not socket.disconnect()) — a graceful server-
    // initiated disconnect tells socket.io-client's own reason
    // ('io server disconnect') NOT to auto-reconnect, which is correct
    // for "you're not welcome" but wrong for what this test simulates: an
    // ordinary dropped connection.
    const serverSocket = [...ns.sockets.values()][ns.sockets.size - 1];
    serverSocket.conn.close();

    await waitForState(controller, (s) => s.connection === 'disconnected');
    const state = await waitForState(controller, (s) => s.connection === 'connected', 10_000);
    expect(state.joinPhase).toBe('joined'); // never regresses to the form

    // The client patches 'connected' the instant its own 'connect' handler
    // runs — before the agent:join it emits in that same handler has
    // necessarily reached and been processed by the server yet. Poll for
    // the count instead of asserting immediately.
    await waitFor(() => joinAttemptCount === 2, 5000);
    expect(joinAttemptCount).toBe(2); // proves a real re-join happened, not just a silent reconnect
    controller.quit();
  }, 15_000);

  it('exam:finalize uploads every required deliverable and records the summary', async () => {
    nextJoinReply = { type: 'ack', ack: {} };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });
    controller.join({ studentId: 'SV20120001', sessionCode: 'ABC123' });
    await waitForState(controller, (s) => s.joinPhase === 'joined' && s.requiredFiles.length > 0);

    // The student actually wrote something before the bell.
    const workspaceDir = controllerWorkspaceDir(controller);
    fs.writeFileSync(path.join(workspaceDir, 'Cau1.docx'), 'bai lam');

    const socket = [...ns.sockets.values()][ns.sockets.size - 1];
    socket.emit('exam:finalize', { examSessionId: 'exam-1', reason: 'manual' });

    const state = await waitForState(controller, (s) => s.submission.summary !== null);
    expect(state.submission.finalizing).toBe(false);
    expect(state.submission.summary?.uploaded).toBe(1);
    expect(uploadedBodies.map((b) => b.toString('utf8'))).toEqual(['bai lam']);
    controller.quit();
  });

  it('notifies (and logs) on a disconnect that happens after already joining', async () => {
    nextJoinReply = { type: 'ack', ack: {} };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });
    const notifications: { title: string; body: string }[] = [];
    controller.on('notify', (n) => notifications.push(n));

    controller.join({ studentId: 'SV20120001', sessionCode: 'ABC123' });
    await waitForState(controller, (s) => s.joinPhase === 'joined');

    const socket = [...ns.sockets.values()][ns.sockets.size - 1];
    socket.disconnect(true);

    await waitForState(controller, (s) => s.connection === 'disconnected');
    expect(notifications.some((n) => n.title.includes('Mất kết nối'))).toBe(true);
    controller.quit();
  });

  it('quit() disconnects cleanly and does not throw when called twice', async () => {
    nextJoinReply = { type: 'ack', ack: {} };
    const controller = new SessionController({ backendUrl: baseUrl, workspaceRoot: tmpWorkspaceRoot() });
    controller.join({ studentId: 'SV20120001', sessionCode: 'ABC123' });
    await waitForState(controller, (s) => s.joinPhase === 'joined');

    expect(() => {
      controller.quit();
      controller.quit();
    }).not.toThrow();
  });
});

/** Recovers the same workspaceDir SessionController computed internally
 *  (`<workspaceRoot>/exam-workspace/<studentId>/`), from its own state,
 *  for the one test that needs to plant a file before finalize. */
function controllerWorkspaceDir(controller: SessionController): string {
  const state = controller.getState();
  // requiredFiles[].filename is relative; the log line "Đã tạo N file...
  // Thư mục: <dir>" is the only place the resolved dir is surfaced.
  const entry = state.log.find((l) => l.message.includes('Thư mục:'));
  if (!entry) {
    throw new Error('workspace dir not yet known — join has not completed');
  }
  return entry.message.split('Thư mục:')[1].trim();
}
