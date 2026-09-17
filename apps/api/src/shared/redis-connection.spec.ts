import { buildRedisConnection } from './redis-connection';

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
