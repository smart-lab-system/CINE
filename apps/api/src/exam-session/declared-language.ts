/**
 * Ngôn ngữ giảng viên khai cho bài `code_project` (§14.1). File LEAF — đọc bởi decorator
 * `@Column` (xem ghi chú ở `advocate.types.ts`).
 *
 * Bốn giá trị, dù sandbox chỉ chạy `cpp`, `python` (§3.5): `java`, `node` là ngôn ngữ phần soạn
 * đề đã dùng (`AUTHORING_LANGUAGES`), và bài khai hai ngôn ngữ đó đi đường `one_shot`.
 */
export const DECLARED_LANGUAGES = ['python', 'cpp', 'java', 'node'] as const;
export type DeclaredLanguage = (typeof DECLARED_LANGUAGES)[number];
