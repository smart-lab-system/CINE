import { DeliverableType } from './entities/required-deliverable.entity';

// Every deliverable declared through POST /exam-sessions is a plain
// document submission for this demo's scope (Task 1's ruling, carried
// forward into Task 2) — the client never selects deliverableType, and no
// other value is ever produced by this module.
export const DEFAULT_DELIVERABLE_TYPE: DeliverableType = 'document';

// Session code generation (Task 1 review ruling, handled at the
// application layer instead of a DB-level uppercase constraint): 6-char
// uppercase alphanumeric, retried on a unique-constraint collision so
// session-code matching stays case-consistent with the WebSocket gateway
// (Task 3), which normalizes any incoming sessionCode to uppercase before
// querying.
export const EXAM_SESSION_CODE_LENGTH = 6;
// `O`/`0` and `I`/`1` deliberately excluded — a code the teacher reads
// aloud and a student hand-types is exactly where those pairs cause real
// mistypes (see the student-agent-electron-design spec, §5.1). Only
// consulted here, at generation time: matching a typed-in code is an
// exact-match DB lookup (see ExamSessionGateway.handleAgentJoin), never a
// character-class check, so this change is backward-compatible by
// construction — a session created before this change keeps whatever code
// it already has, `O`/`I`/`0`/`1` included, and still joins fine.
export const EXAM_SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const EXAM_SESSION_CODE_MAX_ATTEMPTS = 5;
