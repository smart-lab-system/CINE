/**
 * Hình dạng của một dòng nhật ký như trang admin đọc. Là CLASS, không phải
 * interface: plugin Swagger của Nest chỉ sinh schema OpenAPI từ class, và
 * `apps/web` lấy kiểu route từ schema đó.
 */
export class AuditLogActorView {
  id!: string;
  name!: string;
  email!: string;
}

export class AuditLogEntryView {
  id!: string;
  occurredAt!: Date;
  /** `null` = dòng của hệ thống (`actor_type = 'system'`), không có người thực hiện. */
  actor!: AuditLogActorView | null;
  action!: string;
  targetType!: string;
  targetId!: string;
  /** `null` khi giá trị vượt `AUDIT_VALUE_CAP_BYTES` — xem `oldValueTruncated`. */
  oldValue!: Record<string, unknown> | null;
  oldValueTruncated!: boolean;
  newValue!: Record<string, unknown> | null;
  newValueTruncated!: boolean;
}

export class AuditLogPageView {
  items!: AuditLogEntryView[];
  total!: number;
  page!: number;
  pageSize!: number;
}
