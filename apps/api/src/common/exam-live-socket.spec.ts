import { extractAccessToken, extractAccessTokenFromCookie } from './exam-live-socket';

/**
 * `extractAccessToken` là điểm vào duy nhất cho việc lấy token của socket.
 * Nó tồn tại vì frontend chuyển sang Bearer: trình duyệt KHÔNG gửi được cookie
 * cho một API nằm ở domain khác (cookie thuộc về host đã đặt nó), nên token
 * phải đi qua `handshake.auth`. Cookie vẫn được đọc làm dự phòng — bộ e2e và
 * dev local cùng origin vẫn dùng đường đó.
 */
describe('extractAccessToken', () => {
  const handshake = (auth: unknown, cookie?: string) =>
    ({ auth, headers: { cookie } }) as Parameters<typeof extractAccessToken>[0];

  it('lấy token từ handshake.auth.token', () => {
    expect(extractAccessToken(handshake({ token: 'jwt-tu-auth' }))).toBe('jwt-tu-auth');
  });

  it('rơi về cookie khi handshake.auth không có token', () => {
    expect(extractAccessToken(handshake({}, 'access_token=jwt-tu-cookie'))).toBe('jwt-tu-cookie');
  });

  it('handshake.auth THẮNG cookie khi cả hai cùng có', () => {
    // Không phải tuỳ tiện: một tab vừa refresh có token mới trong auth nhưng
    // cookie cũ vẫn nằm trong jar cho tới khi Set-Cookie tới nơi. Ưu tiên
    // cookie sẽ xác thực bằng token CŨ và từ chối một phiên hợp lệ.
    expect(extractAccessToken(handshake({ token: 'moi' }, 'access_token=cu'))).toBe('moi');
  });

  it('không có gì cả thì trả null', () => {
    expect(extractAccessToken(handshake(undefined, undefined))).toBeNull();
  });

  it('bỏ qua auth.token không phải chuỗi', () => {
    // socket.handshake.auth là dữ liệu do CLIENT gửi — nó có thể là bất cứ
    // thứ gì. Một object hay số lọt xuống jwtService.verify sẽ ném lỗi ở một
    // nơi xa hơn nhiều so với chỗ nó được nhận vào.
    for (const bad of [123, {}, [], true, null]) {
      expect(extractAccessToken(handshake({ token: bad }, 'access_token=tu-cookie'))).toBe('tu-cookie');
    }
  });

  it('bỏ qua auth.token là chuỗi rỗng, rơi về cookie', () => {
    expect(extractAccessToken(handshake({ token: '   ' }, 'access_token=tu-cookie'))).toBe('tu-cookie');
  });

  it('auth không phải object thì không nổ', () => {
    for (const bad of [null, undefined, 'chuoi', 42]) {
      expect(extractAccessToken(handshake(bad, 'access_token=ok'))).toBe('ok');
    }
  });
});

/** Hành vi cũ, giữ nguyên — đường dự phòng phải không đổi. */
describe('extractAccessTokenFromCookie', () => {
  it('đọc access_token giữa các cookie khác', () => {
    expect(extractAccessTokenFromCookie('a=1; access_token=jwt; b=2')).toBe('jwt');
  });

  it('giải percent-encoding', () => {
    expect(extractAccessTokenFromCookie('access_token=a%2Bb')).toBe('a+b');
  });

  it('không có header thì trả null', () => {
    expect(extractAccessTokenFromCookie(undefined)).toBeNull();
  });

  it('không khớp tên gần giống', () => {
    expect(extractAccessTokenFromCookie('xaccess_token=jwt')).toBeNull();
  });
});
