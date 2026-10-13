/**
 * Thống kê thời gian/token/chi phí mỗi đơn vị chấm của MỘT phiên (spec §11, P0).
 *   pnpm report:attempts --session <uuid>
 * Chỉ-đọc: một transaction READ ONLY, không ghi gì. KHÔNG in DATABASE_URL.
 */
import { Client } from 'pg';
import { sslOptions } from '../src/database/data-source';
import { AttemptRow, summarizeAttempts } from '../src/eval/attempt-stats';

async function main(): Promise<void> {
  const i = process.argv.indexOf('--session');
  const sessionId = i >= 0 ? process.argv[i + 1] : undefined;
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    console.error('Cần --session <uuid của phiên thi>');
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Thiếu DATABASE_URL');
    process.exit(2);
  }
  // Cùng mặc định với data-source.ts. Tên schema nối thẳng vào câu SQL nên phải qua danh sách trắng.
  const schema = process.env.DATABASE_SCHEMA ?? 'examcollect';
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) {
    console.error('DATABASE_SCHEMA không hợp lệ');
    process.exit(2);
  }
  // TLS đúng như app (`DATABASE_SSL`, `DATABASE_SSL_CA`): đoán từ chuỗi kết nối vừa sai host Docker nội bộ,
  // vừa yếu hơn app khi đã khai CA.
  const client = new Client({ connectionString: url, ssl: sslOptions() });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query(
      `SELECT a.grading_result_id AS "resultId", a.started_at AS "startedAt", a.finished_at AS "finishedAt",
              a.outcome, a.tokens_in AS "tokensIn", a.tokens_out AS "tokensOut", a.cost_usd AS "costUsd",
              a.usage_by_model AS "usageByModel"
         FROM ${schema}.grading_attempt a
         JOIN ${schema}.grading_result g ON g.id = a.grading_result_id
         JOIN ${schema}.submission s ON s.id = g.submission_id
        WHERE s.exam_session_id = $1
        ORDER BY a.started_at`,
      [sessionId],
    );
    const attempts: AttemptRow[] = rows.map((r) => ({
      ...r,
      startedAt: new Date(r.startedAt).toISOString(),
      finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
      costUsd: r.costUsd === null ? null : Number(r.costUsd),
    }));
    console.log(JSON.stringify({ sessionId, attempts: attempts.length, stats: summarizeAttempts(attempts) }, null, 2));
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('Lỗi:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
