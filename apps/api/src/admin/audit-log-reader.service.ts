import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AUDIT_VALUE_CAP_BYTES, buildAuditWhere } from './audit-log-query';
import { SearchAuditLogDto } from './dto/search-audit-log.dto';
import { AuditLogEntryView, AuditLogPageView } from './audit-log.types';

interface AuditRow {
  id: string;
  occurredAt: Date;
  action: string;
  targetType: string;
  targetId: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  oldValue: Record<string, unknown> | null;
  oldValueTruncated: boolean;
  newValue: Record<string, unknown> | null;
  newValueTruncated: boolean;
}

/**
 * Phía ĐỌC của nhật ký. Cố ý tách khỏi `AuditLogService`: service đó là "cách
 * duy nhất để ghi" và không có phương thức đọc nào, nên không ai ghi một dòng
 * không có người thực hiện qua nó. Gộp hai việc vào một lớp là mời một phương
 * thức `update` hay `delete` vào đó một ngày nào đó.
 *
 * Truy vấn là SQL thô tham số hoá thay vì QueryBuilder vì hai lý do: bảng được
 * phân vùng nên TypeORM không thêm gì ở đây, và việc CẮT giá trị jsonb phải xảy
 * ra ở Postgres (`CASE WHEN octet_length(...)`), không ở Node — tải về vài MB
 * rồi mới cắt thì cái trần không bảo vệ được gì.
 *
 * Thứ tự `occurred_at DESC, id DESC`: `id` là khoá phụ để hai dòng cùng thời
 * điểm không đổi chỗ giữa các trang.
 */
@Injectable()
export class AuditLogReaderService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async search(query: SearchAuditLogDto): Promise<AuditLogPageView> {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    // `@IsISO8601()` không-nghiêm-ngặt nhận cả tuần ISO ("2026-W01"), dạng cơ bản ("20261005") và độ lệch rút gọn ("…+07"), mà
    // `new Date` đọc thành Invalid Date. Invalid Date là giá trị "truthy": nó đi qua các `if` dưới, bị gắn làm tham số rồi Postgres từ chối
    // (22007) — một lỗi DB mà `PostgresExceptionFilter` không ánh xạ, nên không ra 400 mà ném tiếp lên trên (500, hoặc làm chết tiến
    // trình). Chặn ở đây, nêu ĐÚNG trường sai (so `to > from` với Invalid Date luôn sai nên cũng sẽ nói nhầm "`to` phải sau `from`").
    for (const [name, value] of [['from', from], ['to', to]] as const) {
      if (value && Number.isNaN(value.getTime())) {
        throw new BadRequestException(`\`${name}\` không phải một thời điểm hợp lệ (ví dụ: 2026-10-05T00:00:00.000Z).`);
      }
    }
    if (from && to && !(to > from)) {
      // Không trả 200 rỗng: một khoảng ngược chiều đọc ra như "chưa ai làm gì".
      throw new BadRequestException('`to` phải sau `from`.');
    }

    const { clause, params } = buildAuditWhere({
      actions: query.action,
      actorId: query.actorId,
      targetType: query.targetType,
      targetId: query.targetId,
      from,
      to,
    });

    const cap = `$${params.length + 1}`;
    const limit = `$${params.length + 2}`;
    const offset = `$${params.length + 3}`;

    const rows: AuditRow[] = await this.dataSource.query(
      `SELECT a.id,
              a.occurred_at AS "occurredAt",
              a.action,
              a.target_type AS "targetType",
              a.target_id   AS "targetId",
              a.actor_id    AS "actorId",
              acc.name      AS "actorName",
              acc.email     AS "actorEmail",
              CASE WHEN octet_length(a.old_value::text) > ${cap} THEN NULL ELSE a.old_value END AS "oldValue",
              octet_length(a.old_value::text) > ${cap} AS "oldValueTruncated",
              CASE WHEN octet_length(a.new_value::text) > ${cap} THEN NULL ELSE a.new_value END AS "newValue",
              octet_length(a.new_value::text) > ${cap} AS "newValueTruncated"
         FROM examcollect.audit_log a
         LEFT JOIN examcollect.account acc ON acc.id = a.actor_id
         ${clause}
        ORDER BY a.occurred_at DESC, a.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      [...params, AUDIT_VALUE_CAP_BYTES, query.pageSize, (query.page - 1) * query.pageSize],
    );

    const [{ total }] = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM examcollect.audit_log a ${clause}`,
      params,
    );

    return {
      items: rows.map((row) => this.toView(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private toView(row: AuditRow): AuditLogEntryView {
    return {
      id: row.id,
      occurredAt: row.occurredAt,
      actor: row.actorId
        ? { id: row.actorId, name: row.actorName ?? '', email: row.actorEmail ?? '' }
        : null,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      oldValue: row.oldValue,
      oldValueTruncated: row.oldValueTruncated,
      newValue: row.newValue,
      newValueTruncated: row.newValueTruncated,
    };
  }
}
