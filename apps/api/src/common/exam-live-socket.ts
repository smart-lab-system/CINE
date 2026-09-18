import { Socket } from 'socket.io';

/**
 * What a completed `agent:join` stashes on the socket, and the ONLY
 * identity the submission handlers trust.
 *
 * The `submission:*` payloads carry examSessionId/studentId too (the agent
 * needs them for its own bookkeeping and the contract defines them), but
 * those are claims from an unauthenticated client. Reading identity off the
 * socket instead means an agent cannot upload as, or overwrite the work of,
 * a student it did not join as — no matter what it puts in the payload.
 * SubmissionGateway compares the two and rejects any disagreement.
 */
export interface AgentSocketIdentity {
  examSessionId: string;
  studentId: string;
  fullName: string;
  /**
   * Where a submission from this student gets routed. Resolved once, from
   * the Enrollment that `agent:join` already had to find in order to admit
   * them at all — so collection never repeats that lookup, and a submission
   * can never be written with nobody to route it to.
   */
  homeClassId: string;
  homeTeacherId: string;
}

export function readAgentIdentity(client: Socket): AgentSocketIdentity | null {
  const examSessionId = client.data?.examSessionId as string | undefined;
  const studentId = client.data?.studentId as string | undefined;
  const fullName = client.data?.fullName as string | undefined;
  const homeClassId = client.data?.homeClassId as string | undefined;
  const homeTeacherId = client.data?.homeTeacherId as string | undefined;
  if (!examSessionId || !studentId || !fullName || !homeClassId || !homeTeacherId) {
    return null;
  }
  return { examSessionId, studentId, fullName, homeClassId, homeTeacherId };
}

/**
 * `plainToInstance` + `validate()` both walk an object property by
 * property; a string/number/array/null "payload" is not one, and
 * class-validator throws a raw TypeError on those rather than returning
 * validation errors. Every handler guards with this before either call.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Hình dạng tối thiểu của `socket.handshake` mà việc xác thực cần tới.
 * Khai riêng thay vì nhận cả `Socket`: hàm này là thuần, và một test không
 * nên phải dựng một socket.io Socket giả chỉ để kiểm hai trường.
 */
export interface AuthenticatableHandshake {
  auth?: unknown;
  headers: { cookie?: string };
}

/**
 * Điểm vào DUY NHẤT để lấy access token của một socket.
 *
 * Ưu tiên `handshake.auth.token`, rơi về cookie.
 *
 * Vì sao cần đường `auth`: frontend chạy trên một origin khác API (Vercel vs
 * Railway), và cookie thuộc về host đã ĐẶT nó — trình duyệt không bao giờ gửi
 * cookie của origin frontend sang API, bất kể SameSite. Nên token phải do
 * client đính kèm, và socket.io có sẵn chỗ cho việc đó.
 *
 * Vì sao GIỮ đường cookie: bộ e2e nối socket bằng `extraHeaders: { cookie }`,
 * và dev local chạy cùng registrable domain nên cookie vẫn tới nơi. Bỏ nó đi
 * là bắt cả hai phải sửa mà không đổi lại được gì.
 *
 * Vì sao `auth` THẮNG cookie: một tab vừa refresh có token mới trong auth
 * trong khi cookie cũ còn nằm trong jar cho tới khi Set-Cookie tới nơi. Ưu
 * tiên cookie sẽ xác thực bằng token CŨ và từ chối một phiên hợp lệ.
 */
export function extractAccessToken(handshake: AuthenticatableHandshake): string | null {
  // `handshake.auth` là dữ liệu CLIENT gửi lên — có thể là bất cứ thứ gì.
  // Một số hay object lọt xuống jwtService.verify sẽ ném lỗi ở một nơi xa hơn
  // nhiều so với chỗ nó được nhận vào, nên kiểm kiểu ngay tại đây.
  if (isPlainObject(handshake.auth)) {
    const token = handshake.auth.token;
    if (typeof token === 'string' && token.trim() !== '') {
      return token;
    }
  }
  return extractAccessTokenFromCookie(handshake.headers.cookie);
}
/**
 * Pulls `access_token` out of a raw Cookie header.
 *
 * The token is httpOnly, so a browser attaches it to the socket.io handshake
 * automatically and no client code can put it in `handshake.auth`. Parsing
 * one value out of one header does not warrant a cookie library: `cookie` is
 * only a transitive dependency here, not declared by this package, and this
 * pnpm workspace does not hoist phantom deps.
 *
 * Shared because both ExamSessionGateway (teacher:subscribe) and
 * AccessRequestGateway (teacher:resolve-access-request) authenticate the same
 * kind of socket the same way.
 */
export function extractAccessTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const pair of cookieHeader.split(';')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    if (pair.slice(0, separatorIndex).trim() === 'access_token') {
      const rawValue = pair.slice(separatorIndex + 1).trim();
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }
  return null;
}
