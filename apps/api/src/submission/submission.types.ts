import { SubmissionStatus } from './entities/submission.entity';

/**
 * How long after `end_time` an agent may still upload.
 *
 * Finalize is not the deadline for the upload, it is the trigger for it: an
 * agent hears `exam:finalize`, then has to hash and PUT every deliverable,
 * over a lab network, all at once with 40 other machines. A hard cutoff at
 * end_time would drop exactly the submissions that took longest.
 *
 * It is bounded rather than open-ended so a session from last month cannot
 * still accept writes.
 */
export const SUBMISSION_GRACE_PERIOD_MS = 30 * 60_000;

/**
 * Failure codes returned through the acknowledgement callback of
 * `submission:request-upload-url` and `submission:confirm`.
 *
 * The phase contract named DELIVERABLE_NOT_FOUND and
 * SESSION_NOT_FINALIZING. The other three cover states the contract did not
 * enumerate but that the handlers genuinely reach — the same way
 * `teacher:subscribe:error` was added when Task 3 found that event had no
 * failure path at all. Nothing here renames or replaces an existing code.
 *
 *  NOT_JOINED           this socket has not completed `agent:join`, or is
 *                       claiming a session/student it did not join as
 *  DELIVERABLE_NOT_FOUND the deliverable does not exist, or belongs to a
 *                       different session
 *  SESSION_NOT_FINALIZING the session is not currently accepting uploads
 *                       (not started, cancelled, or past the grace period)
 *  STORAGE_KEY_MISMATCH  the confirmed key is not the one this student and
 *                       deliverable were signed for
 *  OBJECT_NOT_FOUND      storage has no object at that key — the agent
 *                       confirmed an upload that never landed
 *  STORAGE_UNAVAILABLE   storage could not be reached; unknown, not "no"
 */
export type SubmissionErrorCode =
  | 'NOT_JOINED'
  | 'DELIVERABLE_NOT_FOUND'
  | 'SESSION_NOT_FINALIZING'
  | 'STORAGE_KEY_MISMATCH'
  | 'OBJECT_NOT_FOUND'
  | 'STORAGE_UNAVAILABLE';

export interface SubmissionAckError {
  ok: false;
  code: SubmissionErrorCode;
  message: string;
}

export interface RequestUploadUrlAckSuccess {
  ok: true;
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}

export type RequestUploadUrlAck = RequestUploadUrlAckSuccess | SubmissionAckError;

export interface ConfirmSubmissionAckSuccess {
  ok: true;
  status: SubmissionStatus;
  submittedAt: string;
}

export type ConfirmSubmissionAck = ConfirmSubmissionAckSuccess | SubmissionAckError;

/**
 * Server -> teacher room. Only the two terminal collection states are
 * reported: intermediate `received`/`validated` exist for a few
 * milliseconds inside one transaction and are not a thing a teacher can
 * act on.
 *
 * "Chưa nộp" is the absence of a row, not a status — which is why nothing
 * broadcasts it.
 */
export interface LobbySubmissionStatus {
  studentId: string;
  requiredDeliverableId: string;
  status: Extract<SubmissionStatus, 'collected' | 'invalid'>;
  submittedAt: string;
}
