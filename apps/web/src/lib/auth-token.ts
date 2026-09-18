'use client';

/**
 * Access token của phiên hiện tại, giữ trong BỘ NHỚ của tab.
 *
 * Vì sao không dùng cookie như trước: frontend chạy trên Vercel, API chạy ở
 * một domain khác. Cookie thuộc về host đã ĐẶT nó — trình duyệt không bao giờ
 * gửi cookie của origin frontend sang API, bất kể `SameSite`. Nên token phải
 * do JS đính kèm: header `Authorization` cho REST (api-client.ts),
 * `handshake.auth.token` cho socket (socket.ts).
 *
 * Vì sao BỘ NHỚ chứ không phải localStorage: token này đọc được bằng JS, đó
 * là đánh đổi bắt buộc của hướng Bearer. Giữ nó trong biến module thì nó chết
 * cùng tab; ghi vào localStorage là tự kéo dài thời gian sống của nó qua mọi
 * phiên trình duyệt sau đó, không đổi lại được gì — vì bootstrap từ cookie
 * httpOnly đã khôi phục được sau khi F5 (xem dưới).
 *
 * REFRESH TOKEN KHÔNG BAO GIỜ ĐI QUA ĐÂY. Nó ở lại trong cookie httpOnly trên
 * origin Next.js, nơi JS không đọc được — đó là thứ giữ cho mô hình này còn
 * an toàn hơn là "vứt cả hai token vào JS".
 */

/** Nơi bootstrap lấy token sau khi tab tải lại. Same-origin với Next.js. */
const TOKEN_ENDPOINT = '/api/auth/token';

let accessToken: string | null = null;

/**
 * Bootstrap đang bay, chia sẻ cho mọi caller đồng thời.
 *
 * Bắt buộc phải chia sẻ: một trang vừa tải bắn nhiều lời gọi API song song,
 * và nếu mỗi cái tự bootstrap thì đó là N request cho cùng một câu trả lời.
 * Quan trọng hơn — đây là lý do endpoint này tách khỏi `/api/auth/refresh` —
 * refresh XOAY refresh token, nên N lần xoay song song sẽ khiến lần sau vô
 * hiệu hoá cặp token lần trước vừa ghi, đăng xuất người dùng ngay lúc đang cố
 * giữ họ đăng nhập.
 */
let bootstrapInFlight: Promise<string | null> | null = null;

/** Ghi token mới. Gọi sau khi đăng nhập và sau mỗi lần refresh thành công. */
export function setAccessToken(token: string | null): void {
  accessToken = token && token.trim() !== '' ? token : null;
}

/** Xoá token (đăng xuất). */
export function clearAccessToken(): void {
  accessToken = null;
}

/**
 * Đọc đồng bộ, không bao giờ chạm mạng. Dùng khi caller không await được và
 * chấp nhận `null` — ví dụ một lần render.
 */
export function peekAccessToken(): string | null {
  return accessToken;
}

function readToken(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const token = (body as { accessToken?: unknown }).accessToken;
  return typeof token === 'string' && token.trim() !== '' ? token : null;
}

/**
 * Token hiện tại, bootstrap từ cookie httpOnly nếu bộ nhớ trống.
 *
 * Bộ nhớ trống là chuyện BÌNH THƯỜNG, không phải lỗi: mỗi lần F5 là một
 * module scope mới. Cookie `access_token` vẫn còn đó trên origin Next.js
 * (middleware còn tự làm mới nó), chỉ là httpOnly nên JS phải hỏi server hộ.
 *
 * Trả `null` thay vì ném khi chưa có phiên: ở màn đăng nhập thì "chưa có
 * token" là câu trả lời đúng, không phải sự cố.
 *
 * Thất bại KHÔNG được ghi nhớ. Người dùng ở màn login bootstrap hỏng một lần
 * (đúng), rồi đăng nhập; cache thất bại sẽ khiến mọi lời gọi sau đó đi mà
 * không mang token.
 */
export async function getAccessToken(): Promise<string | null> {
  if (accessToken) {
    return accessToken;
  }

  if (!bootstrapInFlight) {
    // IIFE async, không phải `fetch(...).catch(...)`: một `.catch()` gắn vào
    // promise KHÔNG bắt được throw ĐỒNG BỘ từ chính lời gọi fetch. Trình
    // duyệt thật không throw đồng bộ, nhưng hàm này nằm trên đường đi của
    // MỌI request — một ngoại lệ lọt ra đây làm chết cả client, không chỉ
    // một lời gọi. Bọc trong async function biến mọi throw thành reject.
    bootstrapInFlight = (async () => {
      const response = await fetch(TOKEN_ENDPOINT, { credentials: 'same-origin' });
      if (!response.ok) {
        return null;
      }
      return readToken(await response.json().catch(() => null));
    })()
      .catch(() => null)
      .then((token) => {
        // Chỉ ghi khi có giá trị: một bootstrap hỏng chạy song song với một
        // setAccessToken() vừa thành công không được phép xoá token kia đi.
        if (token) {
          accessToken = token;
        }
        return token;
      })
      .finally(() => {
        bootstrapInFlight = null;
      });
  }

  return bootstrapInFlight;
}
