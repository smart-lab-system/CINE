import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

/**
 * Reason a session moved to `completed`. Part of the `exam:finalize`
 * WebSocket payload the agent receives.
 */
export type ExamFinalizeReason = 'scheduled' | 'manual';

export interface ExamFinalizedEvent {
  examSessionId: string;
  reason: ExamFinalizeReason;
}

/**
 * One-way, in-process bus between ExamSessionService (which owns the
 * status transition) and ExamSessionGateway (which owns the socket).
 *
 * The gateway already injects the service, so having the service inject
 * the gateway back to broadcast would be a genuine DI cycle — and
 * CLAUDE.md's backend rule 2 says to extract something both sides depend
 * on rather than reach for forwardRef. This is that something: the
 * service publishes, the gateway subscribes, neither knows about the
 * other.
 *
 * A plain `Subject` (not `ReplaySubject`/`BehaviorSubject`) on purpose:
 * finalize is a moment, not a state. A socket that connects after a
 * session was finalized must NOT be handed a stale finalize command — it
 * learns the session is over from `agent:join` rejecting it
 * (SESSION_NOT_ACTIVE), which is the existing, already-tested path.
 *
 * In-process only, matching the deployment CLAUDE.md describes (single
 * API instance, no Socket.IO Redis adapter — see "Out of scope"). Running
 * two API instances would need a real pub/sub here, not just this.
 */
@Injectable()
export class ExamSessionEvents {
  private readonly finalizedSubject = new Subject<ExamFinalizedEvent>();

  readonly finalized$: Observable<ExamFinalizedEvent> = this.finalizedSubject.asObservable();

  publishFinalized(event: ExamFinalizedEvent): void {
    this.finalizedSubject.next(event);
  }
}
