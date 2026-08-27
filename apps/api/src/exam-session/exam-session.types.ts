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
export const EXAM_SESSION_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const EXAM_SESSION_CODE_MAX_ATTEMPTS = 5;
