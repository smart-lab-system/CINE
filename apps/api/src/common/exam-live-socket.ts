import { Socket } from 'socket.io';

/**
 * What a completed `agent:join` stashes on the socket, and the ONLY
 * identity the submission handlers trust.
 *
 * The `submission:*` payloads carry examSessionId/studentId too (the agent
 * needs them for its own bookkeeping and the contract defines them), but
 * those are claims from an unauthenticated client. Reading identity off the
 * socket instead means an agent cannot upload as, or overwrite the work of,
 * a student it did not join as — no matter what it puts in the payload.
 * SubmissionGateway compares the two and rejects any disagreement.
 */
export interface AgentSocketIdentity {
  examSessionId: string;
  studentId: string;
  fullName: string;
}

export function readAgentIdentity(client: Socket): AgentSocketIdentity | null {
  const examSessionId = client.data?.examSessionId as string | undefined;
  const studentId = client.data?.studentId as string | undefined;
  const fullName = client.data?.fullName as string | undefined;
  if (!examSessionId || !studentId || !fullName) {
    return null;
  }
  return { examSessionId, studentId, fullName };
}

/**
 * `plainToInstance` + `validate()` both walk an object property by
 * property; a string/number/array/null "payload" is not one, and
 * class-validator throws a raw TypeError on those rather than returning
 * validation errors. Every handler guards with this before either call.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
