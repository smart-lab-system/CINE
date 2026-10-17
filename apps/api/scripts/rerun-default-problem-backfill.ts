/**
 * Chạy lại backfill câu mặc định sau khi triển khai P1a (plan Task 12, bước 4):
 *   pnpm backfill:default-problems                 # ghi thật, một transaction
 *   pnpm backfill:default-problems -- --dry-run    # đếm rồi rollback
 * Đọc cấu hình DB như app (DATABASE_URL, DATABASE_SSL...). KHÔNG in DATABASE_URL.
 * Thoát 0 khi xong; 1 khi cổng checksum lệch (không ghi gì); 2 khi lỗi khác.
 */
import dataSource from '../src/database/data-source';
import { ChecksumMismatchError } from '../src/grading/problem/default-problem-backfill';
import { rerunDefaultProblemBackfill } from '../src/grading/problem/rerun-default-problem-backfill';

async function main(): Promise<number> {
  const dryRun = process.argv.includes('--dry-run');
  await dataSource.initialize();
  try {
    const counts = await rerunDefaultProblemBackfill(dataSource, { dryRun });
    console.log(JSON.stringify({ dryRun, ...counts }));
    return 0;
  } catch (error) {
    if (error instanceof ChecksumMismatchError) {
      console.error(error.message);
      return 1;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  } finally {
    await dataSource.destroy();
  }
}

main().then(
  (code) => process.exit(code),
  () => process.exit(2),
);
