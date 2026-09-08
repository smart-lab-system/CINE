import { SetMetadata } from '@nestjs/common';
import type { AccountRole } from '../identity/entities/account.entity';

export const ROLES_KEY = 'roles';

/**
 * `AccountRole[]`, không phải `string[]`.
 *
 * Trước đây tham số là `string[]`, và đó là một cái bẫy fail-CLOSED: gõ
 * `@Roles('academic_affair')` thiếu một chữ `s` thì biên dịch sạch, guard so
 * sánh không bao giờ khớp, và endpoint bị khóa với đúng role cần dùng nó —
 * không lỗi biên dịch, không lỗi runtime, không log. Chỉ một 403 không ai
 * giải thích được.
 *
 * `import type` để không tạo phụ thuộc runtime từ auth sang identity.
 */
export const Roles = (...roles: AccountRole[]) => SetMetadata(ROLES_KEY, roles);
