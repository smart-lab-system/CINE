import { readFile, writeFile } from 'node:fs/promises';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { dataSourceOptions } from '../data-source';
import { BackfillBlockedError, runBackfill } from './backfill.runner';
import { assertTargetConfirmed, CliUsageError, parseCliArgs } from './cli-args';
import { checkInvariants, compareSnapshots, proveRoomExclusion, takeSnapshot, type DbSnapshot } from './verify';

/**
 * Công cụ vận hành cho đợt khôi phục master data (xem `docs/runbooks/master-data-cutover.md`):
 *   pnpm master-data snapshot --out before.json
 *   pnpm master-data backfill [--dry-run] [--default-semester 2026:1] [--merge "NGUỒN=ĐÍCH"] [--inactive-room TÊN]
 *   pnpm master-data verify --before before.json [--expect bảng=số …]
 * Mã thoát: 0 đạt · 1 verify không đạt · 2 backfill DỪNG vì không ánh xạ được · 64 dùng sai.
 * Đích luôn được in ra TRƯỚC khi làm gì; máy không phải local đòi --confirm-host.
 */
async function main(): Promise<number> {
  const args = parseCliArgs(process.argv.slice(2));
  const url = args.databaseUrl ?? process.env.DATABASE_URL;
  const target = assertTargetConfirmed(url, args.confirmHost);
  console.log(`Đích: ${target.host}/${target.database}`);

  // `dataSourceOptions` là kiểu hợp của mọi driver nên không thêm `url` được; giá trị thật luôn là Postgres (xem data-source.ts).
  const ds = new DataSource({ ...(dataSourceOptions as PostgresConnectionOptions), url });
  await ds.initialize();
  try {
    if (args.command === 'snapshot') {
      const file = args.out ?? 'master-data-before.json';
      const snapshot = await takeSnapshot(ds);
      await writeFile(file, JSON.stringify(snapshot, null, 2), 'utf8');
      console.log(`Đã ghi ${file}: ${Object.keys(snapshot.tables).length} bảng, checksum ${Object.keys(snapshot.checksums).join(', ')}.`);
      return 0;
    }

    if (args.command === 'backfill') {
      try {
        const report = await runBackfill(
          ds,
          { defaultSemester: args.defaultSemester, merges: args.merges, inactiveRooms: args.inactiveRooms },
          { dryRun: args.dryRun },
        );
        console.log(JSON.stringify(report, null, 2));
        console.log(report.dryRun ? 'DRY-RUN: đã lùi lại, không ghi gì.' : report.complete ? 'Backfill xong, không còn gì thiếu.' : 'Backfill xong NHƯNG còn thiếu — xem "remaining".');
        return 0;
      } catch (error) {
        if (error instanceof BackfillBlockedError) {
          console.error(error.message);
          return 2;
        }
        throw error;
      }
    }

    if (!args.before) throw new CliUsageError('verify cần --before <file> (bản chụp lấy TRƯỚC mọi migration của đợt này).');
    const before = JSON.parse(await readFile(args.before, 'utf8')) as DbSnapshot;
    const comparison = compareSnapshots(before, await takeSnapshot(ds), args.expect);
    const invariants = await checkInvariants(ds);
    const exclusion = await proveRoomExclusion(ds);
    console.log(['--- Số dòng và checksum ---', ...comparison.lines, ...comparison.problems.map((p) => `LỖI ${p}`)].join('\n'));
    console.log(['--- Bất biến ---', ...(invariants.length > 0 ? invariants.map((p) => `LỖI ${p}`) : ['đạt'])].join('\n'));
    console.log(`--- Chống trùng phòng theo room_id --- ${exclusion.status}: ${exclusion.detail}`);
    return comparison.ok && invariants.length === 0 && exclusion.status !== 'FAILED' ? 0 : 1;
  } finally {
    await ds.destroy();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(error instanceof CliUsageError ? 64 : 1);
  },
);
