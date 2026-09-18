import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Kho access token trong bộ nhớ.
 *
 * Nó tồn tại vì frontend và API nằm ở hai domain khác nhau (Vercel vs
 * Railway): cookie thuộc về host đã ĐẶT nó, nên cookie do origin frontend
 * đặt không bao giờ được gửi sang API, bất kể SameSite. Token phải do JS
 * đính kèm — qua header Authorization cho REST, qua handshake.auth cho socket.
 *
 * Module có state ở cấp module, nên mỗi test nạp lại nó từ đầu.
 */
async function freshStore() {
  vi.resetModules();
  return import('./auth-token');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('auth-token', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('trả token đã set mà KHÔNG gọi mạng', async () => {
    const { setAccessToken, getAccessToken } = await freshStore();
    setAccessToken('jwt-abc');

    await expect(getAccessToken()).resolves.toBe('jwt-abc');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('khi rỗng thì bootstrap từ /api/auth/token', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ accessToken: 'jwt-tu-cookie' }));
    const { getAccessToken } = await freshStore();

    await expect(getAccessToken()).resolves.toBe('jwt-tu-cookie');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('/api/auth/token');
  });

  /**
   * Đây là lý do có bootstrap riêng thay vì gọi /api/auth/refresh: refresh
   * XOAY refresh token. Một trang vừa tải mà bắn 5 lời gọi API song song sẽ
   * xoay 5 lần, và lần xoay sau vô hiệu hoá cặp token lần trước vừa ghi —
   * đăng xuất người dùng ngay lúc đang cố giữ họ đăng nhập.
   */
  it('nhiều lời gọi đồng thời dùng CHUNG một request bootstrap', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ accessToken: 'jwt-1' }));
    const { getAccessToken } = await freshStore();

    const all = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]);

    expect(all).toEqual(['jwt-1', 'jwt-1', 'jwt-1']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('sau bootstrap, lời gọi tiếp theo dùng bộ nhớ, không gọi mạng nữa', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ accessToken: 'jwt-1' }));
    const { getAccessToken } = await freshStore();

    await getAccessToken();
    await getAccessToken();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('401 (chưa đăng nhập) trả null, không ném', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ message: 'No session' }, 401));
    const { getAccessToken } = await freshStore();

    await expect(getAccessToken()).resolves.toBeNull();
  });

  it('lỗi mạng trả null, không ném', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    const { getAccessToken } = await freshStore();

    await expect(getAccessToken()).resolves.toBeNull();
  });

  /**
   * Bootstrap hỏng KHÔNG được nhớ là "vĩnh viễn không có token": người dùng
   * ở màn login sẽ bootstrap hỏng một lần (đúng — chưa có phiên), rồi đăng
   * nhập. Nếu thất bại bị cache thì mọi lời gọi sau đó đều đi không token.
   */
  it('bootstrap hỏng không chặn setAccessToken sau đó', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({}, 401));
    const { getAccessToken, setAccessToken } = await freshStore();

    await expect(getAccessToken()).resolves.toBeNull();
    setAccessToken('jwt-sau-khi-dang-nhap');
    await expect(getAccessToken()).resolves.toBe('jwt-sau-khi-dang-nhap');
  });

  it('bootstrap hỏng thì lần gọi sau THỬ LẠI, không cache thất bại', async () => {
    const f = fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(jsonResponse({}, 401));
    f.mockResolvedValueOnce(jsonResponse({ accessToken: 'jwt-lan-hai' }));
    const { getAccessToken } = await freshStore();

    await expect(getAccessToken()).resolves.toBeNull();
    await expect(getAccessToken()).resolves.toBe('jwt-lan-hai');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('clearAccessToken xoá bộ nhớ (đăng xuất)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({}, 401));
    const { setAccessToken, clearAccessToken, getAccessToken } = await freshStore();

    setAccessToken('jwt-abc');
    clearAccessToken();

    await expect(getAccessToken()).resolves.toBeNull();
  });

  it('body thiếu accessToken hoặc sai kiểu đều thành null', async () => {
    for (const body of [{}, { accessToken: 123 }, { accessToken: '' }, { accessToken: null }]) {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(body));
      const { getAccessToken } = await freshStore();
      await expect(getAccessToken()).resolves.toBeNull();
    }
  });

  it('peekAccessToken đọc đồng bộ, không bao giờ gọi mạng', async () => {
    const { setAccessToken, peekAccessToken } = await freshStore();

    expect(peekAccessToken()).toBeNull();
    setAccessToken('jwt-abc');
    expect(peekAccessToken()).toBe('jwt-abc');
    expect(fetch).not.toHaveBeenCalled();
  });
});
