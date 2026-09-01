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
 * A teacher successfully attached a new exam material to a session.
 *
 * Carries no material data on purpose — this is a "check again" nudge, not
 * a delivery. The agent still fetches through `agent:request-materials`,
 * which is the one place Security rule 2 is enforced (ExamMaterialService.
 * listForAgent re-checks the release clock on every call); this event only
 * exists to make sure an already-connected agent ever asks again at all.
 * QA-reported gap: a student who joined BEFORE the teacher uploaded
 * anything got `examMaterialCount: 0` in their join ack and, without this,
 * was never told to re-check — permanently, short of a full reconnect.
 */
export interface ExamMaterialAddedEvent {
  examSessionId: string;
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
  private readonly materialAddedSubject = new Subject<ExamMaterialAddedEvent>();

  readonly finalized$: Observable<ExamFinalizedEvent> = this.finalizedSubject.asObservable();
  readonly materialAdded$: Observable<ExamMaterialAddedEvent> =
    this.materialAddedSubject.asObservable();

  publishFinalized(event: ExamFinalizedEvent): void {
    this.finalizedSubject.next(event);
  }

  publishMaterialAdded(event: ExamMaterialAddedEvent): void {
    this.materialAddedSubject.next(event);
  }
}
