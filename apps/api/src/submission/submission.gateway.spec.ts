import { Socket } from 'socket.io';
import { SubmissionGateway } from './submission.gateway';
import { SubmissionService } from './submission.service';

/**
 * The identity check is the security property of the whole submission
 * flow, and it lives here rather than in the service.
 *
 * An agent connection is unauthenticated by design — it presents only the
 * projector-displayed session code — so the examSessionId/studentId in a
 * `submission:*` payload are claims, not credentials. The gateway trusts
 * `client.data` (written by `agent:join` after that handler resolved the
 * session itself) and refuses anything that disagrees. Without that, any
 * connected agent could request an upload URL for, and overwrite, a
 * classmate's deliverable.
 *
 * submission.service.spec.ts covers the service's own refusals; nothing
 * there exercises this, because the service is handed an already-resolved
 * identity.
 */

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const DELIVERABLE_ID = '22222222-2222-4222-8222-222222222222';
const MSSV = 'SV20120001';

function joinedSocket(
  data: Partial<{
    examSessionId: string;
    studentId: string;
    fullName: string;
    homeClassId: string;
    homeTeacherId: string;
    machineName: string | null;
  }> = {},
): Socket {
  return {
    id: 'socket-1',
    data: {
      examSessionId: SESSION_ID,
      studentId: MSSV,
      fullName: 'Nguyen Van A',
      homeClassId: '44444444-4444-4444-8444-444444444444',
      homeTeacherId: '55555555-5555-4555-8555-555555555555',
      machineName: null,
      ...data,
    },
  } as unknown as Socket;
}

function createHarness() {
  const submissions = {
    requestUploadUrl: jest.fn().mockResolvedValue({
      ok: true,
      uploadUrl: 'http://storage/signed',
      storageKey: 'submissions/x/y/z',
      expiresIn: 900,
    }),
    confirmSubmission: jest.fn().mockResolvedValue({
      ack: { ok: true, status: 'collected', submittedAt: '2026-08-29T04:00:00.000Z' },
      broadcast: null,
    }),
  };
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const gateway = new SubmissionGateway(submissions as unknown as SubmissionService);
  // @WebSocketServer() is populated by Nest at runtime; injected directly
  // here so the broadcast path is observable without booting the app.
  (gateway as unknown as { server: unknown }).server = { to };
  return { gateway, submissions, to, emit };
}

const validRequest = {
  examSessionId: SESSION_ID,
  studentId: MSSV,
  requiredDeliverableId: DELIVERABLE_ID,
};

const validConfirm = {
  ...validRequest,
  storageKey: `submissions/${SESSION_ID}/${MSSV}/${DELIVERABLE_ID}`,
  checksum: 'a'.repeat(64),
  fileSize: 128,
};

describe('SubmissionGateway — identity', () => {
  it('refuses a socket that never completed agent:join', async () => {
    const { gateway, submissions } = createHarness();
    const stranger = { id: 'socket-2', data: {} } as unknown as Socket;

    const ack = await gateway.handleRequestUploadUrl(stranger, validRequest);

    expect(ack).toMatchObject({ ok: false, code: 'NOT_JOINED' });
    expect(submissions.requestUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses a payload claiming a different student', async () => {
    const { gateway, submissions } = createHarness();

    const ack = await gateway.handleRequestUploadUrl(joinedSocket(), {
      ...validRequest,
      studentId: 'SV99999999',
    });

    // Without this, any connected agent could mint an upload URL scoped to
    // a classmate and overwrite their work.
    expect(ack).toMatchObject({ ok: false, code: 'NOT_JOINED' });
    expect(submissions.requestUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses a payload claiming a different session', async () => {
    const { gateway, submissions } = createHarness();

    const ack = await gateway.handleConfirm(joinedSocket(), {
      ...validConfirm,
      examSessionId: OTHER_SESSION_ID,
    });

    expect(ack).toMatchObject({ ok: false, code: 'NOT_JOINED' });
    expect(submissions.confirmSubmission).not.toHaveBeenCalled();
  });

  it('passes the socket identity to the service, not the payload', async () => {
    const { gateway, submissions } = createHarness();

    await gateway.handleRequestUploadUrl(joinedSocket(), validRequest);

    const [identity] = submissions.requestUploadUrl.mock.calls[0];
    expect(identity).toEqual({
      examSessionId: SESSION_ID,
      studentId: MSSV,
      fullName: 'Nguyen Van A',
      homeClassId: '44444444-4444-4444-8444-444444444444',
      homeTeacherId: '55555555-5555-4555-8555-555555555555',
      machineName: null,
    });
  });

  it.each([
    ['a string', 'not-an-object'],
    ['null', null],
    ['an array', []],
    ['a number', 42],
  ])('refuses %s instead of a payload object', async (_label, body) => {
    // class-validator throws a raw TypeError on a non-object rather than
    // returning validation errors, so this has to be caught before it.
    const { gateway, submissions } = createHarness();

    const ack = await gateway.handleRequestUploadUrl(joinedSocket(), body);

    expect(ack).toMatchObject({ ok: false, code: 'NOT_JOINED' });
    expect(submissions.requestUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses a confirm whose checksum is not a sha256 digest', async () => {
    const { gateway, submissions } = createHarness();

    const ack = await gateway.handleConfirm(joinedSocket(), {
      ...validConfirm,
      checksum: 'nope',
    });

    // Would otherwise surface as a raw Postgres check violation from
    // ck_submission_checksum at write time.
    expect(ack).toMatchObject({ ok: false });
    expect(submissions.confirmSubmission).not.toHaveBeenCalled();
  });
});

describe('SubmissionGateway — broadcast and failure handling', () => {
  it('broadcasts lobby:submission_status to the teacher room only', async () => {
    const { gateway, submissions, to, emit } = createHarness();
    const broadcast = {
      studentId: MSSV,
      requiredDeliverableId: DELIVERABLE_ID,
      status: 'collected' as const,
      submittedAt: '2026-08-29T04:00:00.000Z',
    };
    submissions.confirmSubmission.mockResolvedValue({
      ack: { ok: true, status: 'collected', submittedAt: broadcast.submittedAt },
      broadcast,
    });

    await gateway.handleConfirm(joinedSocket(), validConfirm);

    // The agents room is unauthenticated and this payload names a student.
    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith(`exam-session:${SESSION_ID}:teachers`);
    expect(emit).toHaveBeenCalledWith('lobby:submission_status', broadcast);
  });

  it('broadcasts nothing when the service wrote no row', async () => {
    const { gateway, submissions, to } = createHarness();
    submissions.confirmSubmission.mockResolvedValue({
      ack: { ok: false, code: 'OBJECT_NOT_FOUND', message: 'no' },
      broadcast: null,
    });

    await gateway.handleConfirm(joinedSocket(), validConfirm);

    expect(to).not.toHaveBeenCalled();
  });

  it('answers the acknowledgement callback even when the service throws', async () => {
    const { gateway, submissions } = createHarness();
    submissions.confirmSubmission.mockRejectedValue(new Error('db is down'));

    const ack = await gateway.handleConfirm(joinedSocket(), validConfirm);

    // An exception escaping into Nest's generic WS error event would leave
    // the agent waiting on a callback that never arrives — at the end of an
    // exam, with the student's work still unsaved.
    expect(ack).toMatchObject({ ok: false, code: 'STORAGE_UNAVAILABLE' });
  });
});
