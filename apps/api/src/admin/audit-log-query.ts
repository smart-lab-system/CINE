/**
 * Dựng mệnh đề WHERE cho trang đọc `audit_log`.
 *
 * Hàm THUẦN, tách khỏi service để test mà không cần DB, và để có đúng một chỗ
 * trả lời "giá trị của người dùng đi vào câu SQL bằng cách nào": chỉ bằng
 * THAM SỐ ($1, $2, …), không bao giờ nội suy chuỗi.
 *
 * Khớp tiền tố dùng `starts_with`, không dùng `LIKE`. Tên hành động chứa dấu
 * gạch dưới (`reassign_teacher`, `access_granted`) và `_` là ký tự đại diện
 * của LIKE: `LIKE 'exam_session.%'` khớp luôn `examXsession.…`, còn một giá
 * trị người dùng có `%` thì khớp mọi thứ. `starts_with` không có ký tự đại
 * diện nào, nên không phải escape gì.
 */

/** Trần kích thước (tính bằng byte của dạng văn bản jsonb) của mỗi giá trị trong danh sách. */
export const AUDIT_VALUE_CAP_BYTES = 4096;

export interface AuditLogFilters {
  /**
   * Mỗi mục kết thúc bằng `.` là một TIỀN TỐ (`room.` khớp `room.create`,
   * `room.update`, …); mục khác khớp CHÍNH XÁC.
   */
  actions?: string[];
  actorId?: string;
  targetType?: string;
  targetId?: string;
  /** Bao gồm. */
  from?: Date;
  /** KHÔNG bao gồm — để hai khoảng liền kề không đếm một dòng hai lần. */
  to?: Date;
}

export interface BuiltWhere {
  /** Rỗng, hoặc bắt đầu bằng `WHERE `. Bảng được gọi là `a`. */
  clause: string;
  params: unknown[];
}

export function buildAuditWhere(filters: AuditLogFilters): BuiltWhere {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.actions && filters.actions.length > 0) {
    const parts = filters.actions.map((entry) =>
      entry.endsWith('.')
        ? `starts_with(a.action, ${bind(entry)})`
        : `a.action = ${bind(entry)}`,
    );
    conditions.push(`(${parts.join(' OR ')})`);
  }
  if (filters.actorId) conditions.push(`a.actor_id = ${bind(filters.actorId)}`);
  if (filters.targetType) conditions.push(`a.target_type = ${bind(filters.targetType)}`);
  if (filters.targetId) conditions.push(`a.target_id = ${bind(filters.targetId)}`);
  if (filters.from) conditions.push(`a.occurred_at >= ${bind(filters.from)}`);
  if (filters.to) conditions.push(`a.occurred_at < ${bind(filters.to)}`);

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}
