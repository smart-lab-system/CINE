import { describe, expect, it, vi, beforeEach } from 'vitest';

const get = vi.fn();
// `@/lib/api-client`, KHÔNG phải `@/lib/api/client` — mock sai đường dẫn thì
// vitest im lặng để request thật bay ra ngoài, và lỗi hiện ra là "Unauthorized"
// chứ không phải "chưa mock".
vi.mock('@/lib/api-client', () => ({ apiClient: { GET: (...a: unknown[]) => get(...a) } }));

const { listCourseCatalog } = await import('@/lib/api/department');

describe('listCourseCatalog', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ data: [], error: undefined, response: { ok: true } });
  });

  it('không gửi tham số nào khi không lọc gì', async () => {
    await listCourseCatalog({});
    expect(get).toHaveBeenCalledWith('/courses', { params: { query: {} } });
  });

  it('gửi unowned dưới dạng chuỗi "true", không phải boolean', async () => {
    // API dùng @IsIn(['true']) vì ValidationPipe không bật
    // enableImplicitConversion — một boolean query param sẽ tới service dưới
    // dạng chuỗi, và "false" là truthy.
    await listCourseCatalog({ semesterId: 'abc', unowned: true });
    expect(get).toHaveBeenCalledWith('/courses', {
      params: { query: { semesterId: 'abc', unowned: 'true' } },
    });
  });

  it('unowned: false thì KHÔNG gửi tham số — gửi "false" sẽ ra 400', async () => {
    await listCourseCatalog({ unowned: false });
    expect(get).toHaveBeenCalledWith('/courses', { params: { query: {} } });
  });
});
