import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './auth-token';

// One shared socket.io-client instance for the whole app, constructed once
// at module load — never call `io(...)` again anywhere else (e.g. inside a
// component or a hook), or every render/mount would open a brand-new
// connection to the server instead of reusing this one.
//
// XÁC THỰC: token đi trong `auth`, không phải cookie.
//
// Trước đây chỗ này dùng `withCredentials: true` và dựa vào việc trình duyệt
// tự đính cookie `access_token` httpOnly vào handshake. Cách đó chỉ chạy khi
// frontend và API cùng site. Với frontend trên Vercel và API ở domain khác,
// cookie của origin frontend không bao giờ tới được API — bắt tay sẽ đi tới
// nơi mà không mang theo gì, và gateway từ chối `teacher:subscribe`.
//
// `auth` nhận CALLBACK chứ không phải object tĩnh: socket.io gọi lại nó trước
// MỖI lần kết nối, kể cả những lần tự kết nối lại. Một object tĩnh sẽ đóng
// băng token của lần dựng module đầu tiên, và mọi lần redial sau khi token
// hết hạn đều trình lại đúng cái token đã chết đó — chính kịch bản mà
// lib/socket-recovery.ts sinh ra để cứu, nên nó phải cứu được thật.
//
// Phía server đọc `handshake.auth.token` rồi mới rơi về cookie
// (apps/api/src/common/exam-live-socket.ts).
export const socket: Socket = io(
  `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/exam-live`,
  {
    auth: (cb) => {
      // Không await được ở đây (socket.io muốn một callback), nên đường lỗi
      // phải tự xử lý: gửi `{}` và để gateway từ chối là hành vi ĐÚNG khi
      // chưa đăng nhập — cùng kết quả như trước đây khi không có cookie.
      void getAccessToken()
        .then((token) => cb(token ? { token } : {}))
        .catch(() => cb({}));
    },
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
    autoConnect: false,
  },
);
