import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface PendingAccessRequest {
  requestId: string;
  examSessionId: string;
  studentId: string;
  fullName: string;
  reason: string;
  requestedAt: string;
  /** The waiting agent's socket, so the decision can be delivered back to it. */
  socketId: string;
}

/**
 * Access requests waiting for an invigilator, held in memory.
 *
 * Not a table, on purpose. A request lives for the seconds between a student
 * being refused and the invigilator looking up; it is meaningless the moment
 * the exam ends, and it is never referenced by anything else. What *is*
 * durable — that a human opened the door, who, for whom, and why — goes to
 * `audit_log` at approval time, which is the part anyone will ever need to
 * look back at.
 *
 * The cost is that a server restart drops pending requests. During an exam
 * that restart also drops every agent socket, so those students are
 * reconnecting and re-asking anyway.
 *
 * A teacher's page refresh is the case that would hurt, and it does not:
 * these live server-side, and `teacher:subscribe` replays whatever is still
 * pending to the newly-subscribed socket.
 */
@Injectable()
export class AccessRequestStore {
  private readonly byId = new Map<string, PendingAccessRequest>();

  create(input: Omit<PendingAccessRequest, 'requestId' | 'requestedAt'>): PendingAccessRequest {
    // One pending request per (session, student): a student mashing the
    // button must not fill the invigilator's screen with duplicates of
    // themselves.
    const existing = this.findFor(input.examSessionId, input.studentId);
    if (existing) {
      // Keep the original id so an already-shown card stays resolvable, but
      // follow the student to their current socket and latest reason.
      existing.socketId = input.socketId;
      existing.fullName = input.fullName;
      existing.reason = input.reason;
      return existing;
    }

    const pending: PendingAccessRequest = {
      ...input,
      requestId: randomUUID(),
      requestedAt: new Date().toISOString(),
    };
    this.byId.set(pending.requestId, pending);
    return pending;
  }

  get(requestId: string): PendingAccessRequest | undefined {
    return this.byId.get(requestId);
  }

  remove(requestId: string): void {
    this.byId.delete(requestId);
  }

  /** Everything still waiting for one session — replayed on teacher:subscribe. */
  listForSession(examSessionId: string): PendingAccessRequest[] {
    return [...this.byId.values()].filter((r) => r.examSessionId === examSessionId);
  }

  /**
   * Drops whatever this socket was waiting on. Called from disconnect, so a
   * student who gave up and closed the agent stops occupying a card the
   * invigilator would otherwise have to clear by hand.
   */
  removeForSocket(socketId: string): void {
    for (const [id, pending] of this.byId) {
      if (pending.socketId === socketId) {
        this.byId.delete(id);
      }
    }
  }

  private findFor(examSessionId: string, studentId: string): PendingAccessRequest | undefined {
    for (const pending of this.byId.values()) {
      if (pending.examSessionId === examSessionId && pending.studentId === studentId) {
        return pending;
      }
    }
    return undefined;
  }
}
