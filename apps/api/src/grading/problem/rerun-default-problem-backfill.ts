import { DataSource } from 'typeorm';
import { BackfillCounts, backfillDefaultProblems } from './default-problem-backfill';

/**
 * Chạy lại backfill câu mặc định SAU triển khai P1a (§10.1, bước 3): kéo câu 1 theo cột bí danh của phiên
 * (code cũ còn ghi chúng trong khoảng giữa migration và deploy) và điền phần còn thiếu.
 *
 * Một transaction. `dryRun` đếm rồi rollback, không ghi gì. Cổng checksum lệch → rollback toàn bộ và ném lỗi.
 */
export async function rerunDefaultProblemBackfill(
  ds: DataSource,
  opts: { dryRun?: boolean } = {},
): Promise<BackfillCounts> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const counts = await backfillDefaultProblems(qr);
    if (opts.dryRun) await qr.rollbackTransaction();
    else await qr.commitTransaction();
    return counts;
  } catch (error) {
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    throw error;
  } finally {
    await qr.release();
  }
}
