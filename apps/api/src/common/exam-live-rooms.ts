/**
 * Socket.IO room names for the `/exam-live` namespace.
 *
 * Lives in `common/` rather than inside exam-session because two modules
 * now broadcast into these rooms — exam-session (lobby + finalize) and
 * submission (per-file status) — and CLAUDE.md's backend rule 1 puts
 * anything shared by 2+ modules here. Both gateways attach to the same
 * namespace, so `server.to(...)` from either reaches the same members.
 */

/**
 * Teacher-only. Membership requires a valid access_token cookie AND
 * ownership of the session (see ExamSessionGateway.handleTeacherSubscribe).
 *
 * Deliberately NOT shared with agents. An agent socket is unauthenticated
 * by design — it presents only the projector-displayed session code — so if
 * agents were members here, any of them could listen for
 * `lobby:student_joined` / `lobby:submission_status` and harvest every
 * classmate's {studentId, fullName} as they joined. Everything broadcast to
 * this room may contain student data; nothing broadcast to it may reach an
 * agent.
 */
export function teacherRoom(examSessionId: string): string {
  return `exam-session:${examSessionId}:teachers`;
}

/**
 * Agents of one session. Exists solely so the server can push
 * `exam:finalize` — the only direction of server -> agent messaging in the
 * system (the agent still opens every connection itself, per Security
 * rule 8).
 *
 * Membership is unauthenticated, exactly like `agent:join` itself, so
 * NOTHING carrying student data may ever be broadcast here.
 * `exam:finalize` is an id plus a reason; any future event added to this
 * room must clear the same bar.
 */
export function agentRoom(examSessionId: string): string {
  return `exam-session:${examSessionId}:agents`;
}
