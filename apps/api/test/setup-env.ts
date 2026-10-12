/**
 * Nạp `.env.test` TRƯỚC khi bất kỳ spec nào import AppModule, rồi từ chối
 * chạy nếu hạ tầng được trỏ không phải là local e2e.
 *
 * Chạy ở đâu: `setupFiles` của jest-e2e.json. Jest chạy setupFiles sau khi
 * dựng test environment nhưng TRƯỚC khi nạp file spec — nên tới lúc
 * `data-source.ts` chạy `import 'dotenv/config'`, các biến ở đây đã nằm sẵn
 * trong process.env, và dotenv theo mặc định KHÔNG ghi đè biến đã có. Đó là
 * cơ chế khiến `.env` (trỏ cloud hoặc DB local chính) thua `.env.test`.
 *
 * Vì sao phải có guard chứ không chỉ nạp file: nạp file là thứ hỏng trong im
 * lặng. Đổi tên file, sửa `rootDir`, gõ nhầm một biến — mọi thứ vẫn "chạy",
 * chỉ là chạy trên database thật. Bộ e2e này KHÔNG tự dọn dữ liệu, nên cái
 * giá của một lần hỏng im lặng là rác vĩnh viễn trên DB production / DB local
 * chính, không phải một test đỏ.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const ENV_TEST_PATH = resolve(__dirname, '..', '.env.test');

/** Database name of docker-compose service `postgres-e2e`. */
const E2E_DATABASE_NAME = 'examcollect_e2e';

/** Host port of docker-compose service `postgres-e2e` (not `postgres` / 5442). */
const E2E_DATABASE_PORT = '5443';

/** Host port of the local main/dev Postgres — e2e must never use this. */
const MAIN_LOCAL_DATABASE_PORT = '5442';

if (!existsSync(ENV_TEST_PATH)) {
  throw new Error(
    `[e2e] Không tìm thấy ${ENV_TEST_PATH}. File này được commit trong repo — ` +
      'nếu thiếu thì nhánh đang dùng chưa có nó, đừng tự tạo tạm một file rồi chạy tiếp.',
  );
}

config({ path: ENV_TEST_PATH, override: true });

/**
 * Host được coi là "máy này". Không có tên miền nào lọt vào đây được: một DB
 * từ xa dùng cho test là một quyết định phải nói thành lời, qua
 * E2E_ALLOW_REMOTE_INFRA bên dưới.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);

function hostnameOf(raw: string | undefined, label: string): string {
  if (!raw) {
    throw new Error(`[e2e] ${label} chưa được đặt trong .env.test.`);
  }
  try {
    return new URL(raw).hostname;
  } catch {
    throw new Error(`[e2e] ${label} không phải URL hợp lệ: ${raw}`);
  }
}

function assertLocal(host: string, label: string, shown: string): void {
  if (LOCAL_HOSTS.has(host)) {
    return;
  }
  throw new Error(
    `[e2e] TỪ CHỐI CHẠY: ${label} đang trỏ tới "${shown}", không phải máy này.\n` +
      'Bộ e2e tạo và xoá dữ liệu thật và KHÔNG tự dọn — chạy nó lên hạ tầng từ xa\n' +
      'sẽ để lại rác vĩnh viễn ở đó.\n' +
      'Muốn làm thật (ví dụ một DB test riêng trên CI) thì đặt E2E_ALLOW_REMOTE_INFRA=true.',
  );
}

/**
 * E2e phải dùng DB e2e riêng — không cloud, không Postgres local chính
 * (`examcollect` trên cổng 5442).
 */
function assertE2eDatabase(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`[e2e] DATABASE_URL không phải URL hợp lệ: ${raw}`);
  }

  const dbName = parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
  const port = parsed.port || (parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:' ? '5432' : '');
  const shown = raw.replace(/\/\/[^@]*@/, '//***@');

  if (dbName !== E2E_DATABASE_NAME) {
    throw new Error(
      `[e2e] TỪ CHỐI CHẠY: DATABASE_URL phải dùng database "${E2E_DATABASE_NAME}" ` +
        `(service postgres-e2e), nhận được "${dbName || '(trống)'}" trong "${shown}".\n` +
        'Không được trỏ e2e vào DB local chính (`examcollect` cổng 5442) hay cloud.',
    );
  }

  if (port === MAIN_LOCAL_DATABASE_PORT) {
    throw new Error(
      `[e2e] TỪ CHỐI CHẠY: DATABASE_URL đang dùng cổng ${MAIN_LOCAL_DATABASE_PORT} ` +
        `(Postgres local chính). E2e phải dùng cổng ${E2E_DATABASE_PORT} (postgres-e2e).\n` +
        `URL: ${shown}`,
    );
  }

  if (LOCAL_HOSTS.has(parsed.hostname) && port && port !== E2E_DATABASE_PORT) {
    throw new Error(
      `[e2e] TỪ CHỐI CHẠY: DATABASE_URL local phải dùng cổng ${E2E_DATABASE_PORT} ` +
        `(postgres-e2e), nhận được cổng "${port}" trong "${shown}".`,
    );
  }
}

if (process.env.E2E_ALLOW_REMOTE_INFRA !== 'true') {
  assertLocal(hostnameOf(process.env.DATABASE_URL, 'DATABASE_URL'), 'DATABASE_URL', String(process.env.DATABASE_URL).replace(/\/\/[^@]*@/, '//***@'));
  assertE2eDatabase(String(process.env.DATABASE_URL));
  assertLocal(hostnameOf(process.env.STORAGE_ENDPOINT, 'STORAGE_ENDPOINT'), 'STORAGE_ENDPOINT', String(process.env.STORAGE_ENDPOINT));

  // Redis khai bằng host/port rời, không phải URL — nên kiểm thẳng, không qua hostnameOf().
  const redisHost = process.env.REDIS_HOST;
  if (!redisHost) {
    throw new Error('[e2e] REDIS_HOST chưa được đặt trong .env.test.');
  }
  assertLocal(redisHost, 'REDIS_HOST', redisHost);

  // `buildRedisConnection` ƯU TIÊN REDIS_URL khi nó có mặt — nên kiểm
  // REDIS_HOST một mình là không đủ. Phát hiện 2026-09-22: `.env.test` từng
  // không khai REDIS_URL, dotenv coi nó là "chưa có" và điền thẳng giá trị
  // cloud từ `.env` vào lúc `data-source.ts` nạp sau — kết quả là MỌI job
  // BullMQ của e2e (archive-check lẫn grading) âm thầm chạy trên Redis từ
  // xa hàng trăm lần trước khi bị phát hiện. `.env.test` giờ khai
  // `REDIS_URL=` (rỗng) để đóng lỗ đó tại nguồn; guard này là lớp thứ hai —
  // nổ ngay nếu dòng đó biến mất hoặc bị gán một giá trị không phải local.
  if (process.env.REDIS_URL) {
    assertLocal(
      hostnameOf(process.env.REDIS_URL, 'REDIS_URL'),
      'REDIS_URL',
      String(process.env.REDIS_URL).replace(/\/\/[^@]*@/, '//***@'),
    );
  }
}
