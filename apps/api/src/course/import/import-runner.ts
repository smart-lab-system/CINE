import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../../admin/audit-log.service';
import {
  needsSimilarConfirmation,
  summarize,
  type ImportPlan,
  type ImportResult,
} from './import.types';

export interface RunImportArgs<W> {
  dataSource: DataSource;
  auditLog: AuditLogService;
  actorId: string;
  dryRun: boolean;
  confirmSimilar: boolean;
  /** Khoá tư vấn: hai import cùng loại không chạy song song (ghi thật). */
  lockName: string;
  audit: { action: string; targetType: string; targetLabel: string };
  plan(manager: EntityManager): Promise<ImportPlan<W>>;
  apply(manager: EntityManager, writes: W[]): Promise<void>;
  /** Trường thêm cho `new_value` của dòng audit (vd danh sách đổi giảng viên của lớp). */
  auditExtra?(plan: ImportPlan<W>): Record<string, unknown>;
}

/**
 * Điều phối MỘT lần import (spec §6.2). Xem trước và ghi thật đi qua CÙNG `plan` — đó là toàn bộ lý do hàm này tồn tại: hai
 * đường tính riêng thì có lúc bản xem trước nói một đằng, lần ghi làm một nẻo.
 *
 *   dryRun            → tính và trả về; không khoá, không ghi, không audit.
 *   ghi + có dòng lỗi → 400 IMPORT_HAS_ERRORS (cả file không được ghi — nguyên tắc 3).
 *   ghi + gần giống chưa xác nhận → 409 NEAR_DUPLICATE (nguyên tắc 4).
 *   ghi + không có gì để ghi → trả kết quả, applied=false, KHÔNG audit (gửi lại cùng một file là no-op).
 *   ghi → `apply`, rồi MỘT dòng audit cho cả lô, cùng transaction.
 *
 * Ghi thật tính lại `plan` BÊN TRONG transaction, sau khi giữ khoá tư vấn: trạng thái "có sẵn" mà planner so là trạng thái
 * lúc ghi chứ không phải lúc xem trước. Mọi `throw` sau khi lấy khoá làm rollback toàn bộ — chưa có gì được ghi ở các
 * nhánh từ chối nên rollback chỉ là nhả khoá.
 */
export async function runImport<W>(args: RunImportArgs<W>): Promise<ImportResult> {
  return args.dataSource.transaction(async (manager) => {
    if (!args.dryRun) {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [args.lockName]);
    }

    const plan = await args.plan(manager);
    const counts = summarize(plan.rows);
    const similar = needsSimilarConfirmation(plan.rows);
    const result: ImportResult = {
      dryRun: args.dryRun,
      applied: false,
      counts,
      rows: plan.rows,
      needsSimilarConfirmation: similar,
    };
    if (args.dryRun) return result;

    if (counts.errors > 0) {
      throw new BadRequestException({
        error: 'IMPORT_HAS_ERRORS',
        message: `File có ${counts.errors} dòng lỗi nên không có gì được ghi. Hãy sửa file rồi chọn lại.`,
        preview: result,
      });
    }
    if (similar && !args.confirmSimilar) {
      throw new ConflictException({
        error: 'NEAR_DUPLICATE',
        message: 'Có mục mới gần giống mục khác. Hãy xem lại bản xem trước và xác nhận nếu đúng là các mục khác nhau.',
        preview: result,
      });
    }
    if (counts.added + counts.updated === 0) return result;

    await args.apply(manager, plan.writes);
    await args.auditLog.recordUserAction(
      {
        actorId: args.actorId,
        action: args.audit.action,
        targetType: args.audit.targetType,
        // `target_id` là `NOT NULL uuid` mà một lô không có đối tượng duy nhất: dùng một UUID mới sinh cho lô (spec §4.2).
        targetId: randomUUID(),
        newValue: {
          targetLabel: args.audit.targetLabel,
          added: counts.added,
          updated: counts.updated,
          unchanged: counts.unchanged,
          ...(args.auditExtra?.(plan) ?? {}),
        },
      },
      manager,
    );
    return { ...result, applied: true };
  });
}
