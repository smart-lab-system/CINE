import { io, type Socket } from 'socket.io-client';

// One shared socket.io-client instance for the whole app, constructed once
// at module load — never call `io(...)` again anywhere else (e.g. inside a
// component or a hook), or every render/mount would open a brand-new
// connection to the server instead of reusing this one.
//
// Namespace + connection contract (see
// apps/api/src/exam-session/exam-session.gateway.ts's class doc comment and
// handleTeacherSubscribe): `withCredentials: true`, NO `auth.token`. The
// `access_token` cookie is httpOnly — this module can't read it — but the
// browser attaches it to the socket.io handshake automatically because the
// gateway's CORS has `credentials: true` (Task 3/4).
//
// `autoConnect: false`: the contract has no `teacher:unsubscribe` event, so
// once a socket calls `teacher:subscribe` it stays joined to that
// session's room for the life of the connection — there is no way to leave
// a room short of disconnecting. Because this instance is shared/reused
// across client-side navigations (Next's App Router doesn't reload the JS
// module when navigating from one /exam-sessions/[id] to another), a
// connection left open across navigation would still be a member of the
// *previous* session's room and would keep leaking that session's
// `lobby:student_joined`/`agent:disconnected` events into the new page.
// The lobby page owns the connect/disconnect lifecycle (connects on mount,
// disconnects on unmount) so navigating to a different session always
// starts from a clean, unsubscribed connection — see
// app/(exam-live)/exam-sessions/[id]/page.tsx.
export const socket: Socket = io(
  `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/exam-live`,
  {
    withCredentials: true,
    autoConnect: false,
  },
);
