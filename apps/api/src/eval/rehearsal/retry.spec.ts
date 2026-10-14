import { HttpError, isConnectPhaseError, isNetworkError, withRetry } from './retry';

const noSleep = async () => undefined;
const netError = (code?: string) => Object.assign(new TypeError('fetch failed'), code ? { cause: { code } } : {});

describe('withRetry()', () => {
  it('thử lại tới khi thành công, chờ tăng dần giữa các lần', async () => {
    const waits: number[] = [];
    let calls = 0;
    const out = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw netError();
        return 'ok';
      },
      { attempts: 4, baseMs: 100, retryable: () => true, sleep: async (ms) => { waits.push(ms); } },
    );
    expect(out).toBe('ok');
    expect(calls).toBe(3);
    expect(waits).toEqual([100, 200]);
  });

  it('lỗi không đáng thử lại thì ném ngay, không gọi lại', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new HttpError(404, 'không có'); }, {
        attempts: 4, baseMs: 1, retryable: () => false, sleep: noSleep,
      }),
    ).rejects.toThrow('không có');
    expect(calls).toBe(1);
  });

  it('hết số lần thử thì ném đúng lỗi cuối cùng', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new Error(`lần ${calls}`); }, {
        attempts: 3, baseMs: 1, retryable: () => true, sleep: noSleep,
      }),
    ).rejects.toThrow('lần 3');
    expect(calls).toBe(3);
  });

  it('báo onRetry mỗi lần sắp thử lại', async () => {
    const seen: number[] = [];
    let calls = 0;
    await withRetry(async () => { if (++calls < 2) throw netError(); return 1; }, {
      attempts: 3, baseMs: 1, retryable: () => true, sleep: noSleep, onRetry: (a) => seen.push(a),
    });
    expect(seen).toEqual([1]);
  });
});

describe('phân loại lỗi mạng', () => {
  it('UND_ERR_CONNECT_TIMEOUT là lỗi trước khi gửi (an toàn để thử lại POST)', () => {
    expect(isConnectPhaseError(netError('UND_ERR_CONNECT_TIMEOUT'))).toBe(true);
    expect(isConnectPhaseError(netError('ECONNREFUSED'))).toBe(true);
  });

  it('ECONNRESET có thể đã gửi request nên KHÔNG phải lỗi trước khi gửi', () => {
    expect(isConnectPhaseError(netError('ECONNRESET'))).toBe(false);
    expect(isConnectPhaseError(netError())).toBe(false);
  });

  it('fetch failed là lỗi mạng; HttpError thì không', () => {
    expect(isNetworkError(netError('ECONNRESET'))).toBe(true);
    expect(isNetworkError(new HttpError(500, 'x'))).toBe(false);
  });
});
