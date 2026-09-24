/**
 * Quyền Redis của user ACL dành cho hàng đợi sandbox (spec §3.5 luật 2): CHỈ
 * khoá dưới prefix của sandbox. Một mật khẩu chung cả instance là đọc ghi được
 * mọi hàng đợi, kể cả hàng trả kết quả.
 *
 * Dùng cho CẢ HAI user — worker trên máy sandbox và API — vì cả hai chỉ cần
 * đụng đúng các khoá này. `acl.sandbox-spec.ts` là thứ chứng minh bộ luật đủ
 * cho BullMQ và không rộng hơn cần thiết.
 */
export function sandboxAclRules(prefix: string): string[] {
  return [
    'resetkeys',
    `~${prefix}:*`,
    'resetchannels',
    '-@all',
    '+@read',
    '+@write',
    '+@list',
    '+@hash',
    '+@sortedset',
    '+@stream',
    '+@string',
    '+@keyspace',
    '+@scripting',
    '+@blocking',
    '+@connection',
    '+@transaction',
    '-@dangerous',
    '-@admin',
  ];
}
