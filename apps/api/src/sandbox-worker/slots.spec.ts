import { SlotPool, withSlot } from './slots';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('withSlot — review I4', () => {
  it('job báo rò container → khe bị cách ly (không trả lại pool), có ghi log', async () => {
    const pool = new SlotPool(['2']);
    const logs: string[] = [];
    const r = await withSlot(pool, async (_slot, onLeak) => {
      onLeak(['cine-abc']);
      return 'kết quả';
    }, (l) => logs.push(l));
    expect(r).toBe('kết quả');
    expect(logs.join(' ')).toMatch(/cách ly.*cine-abc/);
    let got = false;
    void pool.acquire().then(() => (got = true));
    await sleep(20);
    expect(got).toBe(false);
  });

  it('không rò → trả khe, kể cả khi job ném lỗi', async () => {
    const pool = new SlotPool(['2']);
    await expect(withSlot(pool, async () => { throw new Error('x'); }, () => undefined)).rejects.toThrow('x');
    const lease = await pool.acquire();
    expect(lease.item).toBe('2');
  });
});

describe('SlotPool', () => {
  it('trao khe theo thứ tự đến, không bao giờ hai người cùng giữ một khe', async () => {
    const pool = new SlotPool(['2']);
    const log: string[] = [];
    const job = async (who: string) => {
      const lease = await pool.acquire();
      log.push(`${who}+`);
      await sleep(20);
      log.push(`${who}-`);
      lease.release();
    };
    await Promise.all([job('a'), job('b'), job('c')]);
    expect(log).toEqual(['a+', 'a-', 'b+', 'b-', 'c+', 'c-']);
  });

  it('T-ISO-7 (unit) — job đo của hai nguồn, K = 1: các khoảng giữ khe không chồng nhau', async () => {
    const pool = new SlotPool<string | null>([null]);
    const spans: [number, number][] = [];
    const measure = async () => {
      const lease = await pool.acquire();
      const start = performance.now();
      await sleep(15);
      spans.push([start, performance.now()]);
      lease.release();
    };
    await Promise.all([measure(), measure(), measure(), measure()]);
    spans.sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1]);
  });

  it('K = 2: hai job chạy song song, trên hai khe khác nhau', async () => {
    const pool = new SlotPool(['2', '3']);
    const [a, b] = await Promise.all([pool.acquire(), pool.acquire()]);
    expect(new Set([a.item, b.item])).toEqual(new Set(['2', '3']));
  });

  it('trả khe hai lần không tạo ra khe thứ hai', async () => {
    const pool = new SlotPool(['2']);
    const a = await pool.acquire();
    a.release();
    a.release();
    await pool.acquire();
    let second = false;
    void pool.acquire().then(() => (second = true));
    await sleep(10);
    expect(second).toBe(false);
  });
});
