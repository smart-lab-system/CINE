/**
 * Client side of the `agent:join` WebSocket Event Contract implemented by
 * apps/api/src/exam-session/exam-session.gateway.ts.
 *
 * The canonical copy — for the Electron app (`electron/main/`, via
 * session-controller.ts) and for `mock-agent.ts`. `cli.ts` used to declare
 * its own separate copy of these same shapes; it is now retired (design
 * spec §8.4 — parity was confirmed against the running Electron app), so
 * this is the only copy left. Do not rename/reshape anything here without
 * updating exam-session.gateway.ts's contract comment too.
 */

export interface AgentJoinPayload {
  studentId: string;
  sessionCode: string;
  /**
   * No longer sent on join and ignored if it is: the server answers with the
   * roster name instead of comparing one. Still asked for — once — when a
   * student has no roster row and has to request access, because then there
   * is no authoritative name to fall back on.
   */
  fullName?: string;
  /**
   * This machine's own name, read from the OS.
   *
   * Fills {SOMAY} when the teacher declared a filename pattern that uses
   * it. Read, never asked: CLAUDE.md forbids adding a step for the student,
   * and a seat number they typed would be a value nobody could check.
   */
  machineName?: string;
}

export interface AgentJoinAck {
  examSessionId: string;
  sessionName: string;
  requiredFiles: string[];
  requiredDeliverables: {
    id: string;
    requiredFilename: string;
    deliverableType: string;
    /** Tên các file PHẢI CÓ bên trong, nếu deliverable là `.zip`/`.rar` và
     *  giảng viên có khai — ĐÃ RENDER theo đúng sinh viên này, không phải
     *  mẫu thô (xem `exam-session.gateway.ts`, cùng bên gửi). */
    entries?: string[];
  }[];
  // The roster spelling of this student's name, from the server. The name
  // typed into the join screen is not used for identity and is not what
  // comes back here — showing it lets the student catch "wrong MSSV" before
  // the exam rather than after it.
  studentName: string;
  endTime: string;
  /** How many exam materials this session has, and when they open (spec
   *  §5 of the exam-material design — Security rule 2: an agent may sit in
   *  the lobby before it may hold the paper). */
  examMaterialCount: number;
  materialsReleaseAt: string;
  /** Whether a snapshot of this student's folder is waiting in storage. */
  backupAvailable: boolean;
}

/**
 * RATE_LIMITED (design spec §5.2) carries the server-computed
 * `retryAfterMs` on `AgentJoinError` — the UI renders a real countdown,
 * never a client-guessed one.
 */
export type AgentJoinErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_ACTIVE'
  | 'INVALID_INPUT'
  | 'NOT_ENROLLED'
  | 'RATE_LIMITED';

export interface AgentJoinError {
  code: AgentJoinErrorCode;
  message: string;
  /** Only set for RATE_LIMITED. */
  retryAfterMs?: number;
}

/**
 * Server -> Agent, khi giảng viên bấm "Thu lại" (spec
 * docs/superpowers/specs/2026-09-11-exam-collection-phase-design.md §6).
 *
 * Sự kiện RIÊNG, không tái dùng `exam:finalize`: agent đặt `examEnded`
 * vĩnh viễn khi nhận `exam:finalize`, nên bắn lại sự kiện đó không đổi
 * được gì ở phía này.
 */
export interface ExamRecollectPayload {
  examSessionId: string;
}

/**
 * Ack cho `exam:recollect`. Nghĩa là "máy này còn sống và đã nhận lệnh",
 * KHÔNG phải "đã nộp xong" — server đếm ack để báo cho giảng viên biết
 * máy nào không với tới được, và chờ upload xong mới ack sẽ biến một
 * máy đang upload chậm thành một máy bị coi là đã tắt.
 */
export interface RecollectAck {
  ok: boolean;
}
