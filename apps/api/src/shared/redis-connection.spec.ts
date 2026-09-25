import { buildRedisConnection, throttledErrorLog } from './redis-connection';

/**
 * Một hàm thuần trên một object env — không mock ConfigService, vì thứ đang
 * kiểm là quy tắc đọc cấu hình, không phải Nest DI.
 */
describe('buildRedisConnection', () => {
  describe('REDIS_URL', () => {
    it('tách rediss:// thành host/port/username/password và BẬT tls', () => {
      expect(
        buildRedisConnection({
          REDIS_URL: 'rediss://default:s3cr3t@valkey-abc.aivencloud.com:15820',
        }),
      ).toEqual({
        host: 'valkey-abc.aivencloud.com',
        port: 15820,
        username: 'default',
        password: 's3cr3t',
        tls: {},
        db: 0,
      });
    });

    it('redis:// (một chữ s) KHÔNG bật tls', () => {
      expect(buildRedisConnection({ REDIS_URL: 'redis://localhost:6390' })).toMatchObject({
        host: 'localhost',
        port: 6390,
        tls: undefined,
      });
    });

    it('thiếu port thì mặc định 6379', () => {
      expect(buildRedisConnection({ REDIS_URL: 'rediss://default:p@h.example.com' })).toMatchObject({
        port: 6379,
      });
    });

    // Aiven/Upstash sinh password ngẫu nhiên có thể chứa '@', '/', '+'. Chúng
    // BẮT BUỘC được percent-encode trong URI; không decode lại thì auth hỏng
    // với lỗi trông như sai mật khẩu.
    it('giải percent-encoding trong password', () => {
      expect(
        buildRedisConnection({ REDIS_URL: 'rediss://default:a%40b%2Fc%2Bd@h.example.com:1234' }),
      ).toMatchObject({ password: 'a@b/c+d' });
    });

    it('không có username thì để undefined, không phải chuỗi rỗng', () => {
      // ioredis gửi AUTH <username> <password> khi username là chuỗi rỗng,
      // Redis từ chối. Phải là undefined để nó gửi AUTH <password>.
      expect(buildRedisConnection({ REDIS_URL: 'rediss://:onlypass@h.example.com' })).toMatchObject({
        username: undefined,
        password: 'onlypass',
      });
    });

    it('URL sai định dạng thì nổ NGAY, kèm tên biến', () => {
      expect(() => buildRedisConnection({ REDIS_URL: 'không-phải-url' })).toThrow(/REDIS_URL/);
    });

    it('REDIS_URL thắng các biến rời khi cùng có mặt', () => {
      expect(
        buildRedisConnection({
          REDIS_URL: 'rediss://default:p@remote.example.com:1111',
          REDIS_HOST: 'localhost',
          REDIS_PORT: '6390',
        }),
      ).toMatchObject({ host: 'remote.example.com', port: 1111 });
    });
  });

  describe('các biến rời (không có REDIS_URL)', () => {
    it('dựng từ REDIS_HOST/PORT/PASSWORD/TLS/DB', () => {
      expect(
        buildRedisConnection({
          REDIS_HOST: 'r.example.com',
          REDIS_PORT: '6379',
          REDIS_PASSWORD: 'pw',
          REDIS_TLS: 'true',
          REDIS_DB: '0',
        }),
      ).toEqual({
        host: 'r.example.com',
        port: 6379,
        username: undefined,
        password: 'pw',
        tls: {},
        db: 0,
      });
    });

    it('REDIS_PASSWORD rỗng thành undefined (Redis local không có auth)', () => {
      expect(
        buildRedisConnection({ REDIS_HOST: 'localhost', REDIS_PORT: '6390', REDIS_PASSWORD: '' }),
      ).toMatchObject({ password: undefined });
    });

    it('REDIS_TLS khác chuỗi "true" đều là TẮT', () => {
      for (const v of ['false', 'TRUE', '1', 'yes', undefined]) {
        expect(buildRedisConnection({ REDIS_HOST: 'h', REDIS_PORT: '1', REDIS_TLS: v })).toMatchObject({
          tls: undefined,
        });
      }
    });

    it('thiếu cả REDIS_URL lẫn REDIS_HOST thì nổ lúc khởi động', () => {
      expect(() => buildRedisConnection({})).toThrow(/REDIS_URL.*REDIS_HOST|REDIS_HOST.*REDIS_URL/s);
    });

    it('REDIS_PORT không phải số thì nổ, không âm thầm thành NaN', () => {
      expect(() => buildRedisConnection({ REDIS_HOST: 'h', REDIS_PORT: 'abc' })).toThrow(/REDIS_PORT/);
    });
  });
});

describe('throttledErrorLog — lỗi kết nối của hàng đợi', () => {
  const setup = () => {
    let t = 0;
    const lines: string[] = [];
    const report = throttledErrorLog((l) => lines.push(l), { windowMs: 60_000, now: () => t });
    return { lines, report, advance: (ms: number) => void (t += ms) };
  };

  it('ghi lần đầu kèm ngữ cảnh; lặp lại trong khung 60 s thì im, rồi báo số lần đã gộp', () => {
    const { lines, report, advance } = setup();
    report('exec (eval)', new Error('connect ECONNREFUSED 127.0.0.1:6390'));
    for (let i = 0; i < 30; i++) {
      advance(1_000);
      report('exec (eval)', new Error('connect ECONNREFUSED 127.0.0.1:6390'));
    }
    expect(lines).toEqual(['exec (eval): connect ECONNREFUSED 127.0.0.1:6390']);
    advance(31_000);
    report('exec (eval)', new Error('connect ECONNREFUSED 127.0.0.1:6390'));
    expect(lines[1]).toBe('exec (eval): connect ECONNREFUSED 127.0.0.1:6390 (thêm 30 lần gộp)');
  });

  it('thông điệp khác hay ngữ cảnh khác thì ghi riêng', () => {
    const { lines, report } = setup();
    report('exec', new Error('a'));
    report('exec', new Error('b'));
    report('measure', new Error('a'));
    expect(lines).toHaveLength(3);
  });

  it('không bao giờ in mật khẩu: URL mang user:pass bị che; dòng có trần, không xuống dòng', () => {
    const { lines, report } = setup();
    report('x', new Error(`lỗi với rediss://default:s3cret@host:1/0\n${'y'.repeat(1_000)}`));
    expect(lines[0]).not.toMatch(/s3cret/);
    expect(lines[0]).toMatch(/rediss:\/\/\*\*\*@host/);
    expect(lines[0]).not.toMatch(/\n/);
    expect(lines[0].length).toBeLessThan(400);
  });

  it('thứ ném ra không phải Error vẫn ghi được', () => {
    const { lines, report } = setup();
    report('x', 'chuỗi trần');
    expect(lines).toEqual(['x: chuỗi trần']);
  });
});
