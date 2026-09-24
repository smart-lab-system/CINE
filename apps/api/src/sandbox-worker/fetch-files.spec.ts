import { createHash } from 'node:crypto';
import { FileFetchError, generateIntArray, materialize } from './fetch-files';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const body = Buffer.from('int main() {}\n');

function fakeFetch(bytes: Buffer, status = 200) {
  return jest.fn(async () => new Response(new Uint8Array(bytes), { status })) as unknown as typeof fetch;
}
const policy = (f: typeof fetch) => ({ allowedHosts: ['files.example'], allowHttp: false, maxBytes: 1_000, fetchImpl: f });

describe('materialize', () => {
  it('inline → đúng byte', async () => {
    expect((await materialize({ kind: 'inline', content: 'ab' }, policy(fakeFetch(body)))).toString()).toBe('ab');
  });

  it('URL đúng host, đúng sha256 → nội dung', async () => {
    const f = fakeFetch(body);
    const ref = { kind: 'url' as const, url: 'https://files.example/x', sha256: sha(body), bytes: body.length };
    expect((await materialize(ref, policy(f))).equals(body)).toBe(true);
    expect(f).toHaveBeenCalledWith('https://files.example/x', expect.objectContaining({ redirect: 'error' }));
  });

  it('host ngoài danh sách → FileFetchError, không gọi mạng (chống SSRF)', async () => {
    const f = fakeFetch(body);
    const ref = { kind: 'url' as const, url: 'https://169.254.169.254/latest', sha256: sha(body), bytes: body.length };
    await expect(materialize(ref, policy(f))).rejects.toThrow(FileFetchError);
    expect(f).not.toHaveBeenCalled();
  });

  it('http khi không cho phép → FileFetchError', async () => {
    const ref = { kind: 'url' as const, url: 'http://files.example/x', sha256: sha(body), bytes: body.length };
    await expect(materialize(ref, policy(fakeFetch(body)))).rejects.toThrow(/https/);
  });

  it('lệch sha256 → FileFetchError (Review Focus 2)', async () => {
    const ref = { kind: 'url' as const, url: 'https://files.example/x', sha256: 'a'.repeat(64), bytes: body.length };
    await expect(materialize(ref, policy(fakeFetch(body)))).rejects.toThrow(/sha256/);
  });

  it('lớn hơn trần → FileFetchError', async () => {
    const big = Buffer.alloc(2_000, 97);
    const ref = { kind: 'url' as const, url: 'https://files.example/x', sha256: sha(big), bytes: big.length };
    await expect(materialize(ref, policy(fakeFetch(big)))).rejects.toThrow(/trần/);
  });
});

describe('generateIntArray', () => {
  it('tất định theo seed, đúng n phần tử, trong [lo, hi]', () => {
    const a = generateIntArray(1_000, -5, 5, 7);
    expect(a).toBe(generateIntArray(1_000, -5, 5, 7));
    const [n, nums] = a.trim().split('\n');
    expect(Number(n)).toBe(1_000);
    const xs = nums.split(' ').map(Number);
    expect(xs).toHaveLength(1_000);
    expect(xs.every((x) => x >= -5 && x <= 5)).toBe(true);
  });
  it('n = 0 → chỉ có dòng n', () => {
    expect(generateIntArray(0, 0, 1, 1)).toBe('0\n\n');
  });
});
