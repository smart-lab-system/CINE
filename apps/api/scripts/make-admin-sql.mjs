/**
 * In ra câu SQL tạo một tài khoản, với password_hash sinh sẵn.
 *
 * Vì sao cần script chứ không phải một câu INSERT viết tay: Postgres không có
 * argon2. pgcrypto chỉ có bcrypt/md5/sha, mà `AuthService.login` verify bằng
 * `argon2.verify` — một hash bcrypt sẽ được nhận vào DB không vấn đề gì rồi
 * làm mọi lần đăng nhập thất bại, với thông báo y hệt sai mật khẩu.
 *
 * Tham số hash lấy đúng của `AccountsService.create`: argon2id, còn lại mặc
 * định của thư viện. Bám theo nó, đừng "cải tiến" — một hash sinh bằng tham số
 * khác vẫn verify được (argon2 nhúng tham số vào chuỗi hash), nhưng đi lệch
 * khỏi cái app tạo ra là tự tạo hai hạng tài khoản khác nhau.
 *
 *   node scripts/make-admin-sql.mjs <email> <password> [role] [tên]
 *
 * role mặc định 'admin'. Chỉ 'admin' | 'teacher' | 'department_admin' là có
 * chỗ trong app — 'super_admin' tồn tại trong enum nhưng không map vào khu vực
 * nào, tài khoản đó sẽ rơi vào trang "chưa được gán vai trò" (xem
 * apps/web/src/lib/role-areas.ts).
 */
import argon2 from 'argon2';

const MAPPED_ROLES = ['admin', 'teacher', 'department_admin'];

const [email, password, role = 'admin', ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ') || 'Quản trị hệ thống';

if (!email || !password) {
  console.error('Dùng: node scripts/make-admin-sql.mjs <email> <password> [role] [tên]');
  process.exit(1);
}
if (!MAPPED_ROLES.includes(role)) {
  console.error(`role "${role}" không map vào khu vực nào. Chọn một trong: ${MAPPED_ROLES.join(', ')}`);
  process.exit(1);
}
// ck_account_password_hash_length yêu cầu >= 20 ký tự cho HASH (luôn thoả với
// argon2), nhưng mật khẩu ngắn thì không có ràng buộc DB nào chặn — chặn ở đây.
if (password.length < 8) {
  console.error('Mật khẩu phải từ 8 ký tự.');
  process.exit(1);
}

const hash = await argon2.hash(password, { type: argon2.argon2id });

// Nháy đơn trong SQL escape bằng cách nhân đôi. Hash argon2 và role thì không
// bao giờ chứa nháy, nhưng email và tên do người dùng nhập.
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

console.log(`-- Tài khoản ${role}: ${email}
-- Hash sinh lúc ${new Date().toISOString()} bằng argon2id (đúng tham số AccountsService.create).
-- Chạy trong Supabase SQL Editor. Không commit file này.

insert into examcollect.account (name, email, password_hash, role, is_active)
values (${q(name)}, ${q(email)}, ${q(hash)}, ${q(role)}, true)
on conflict (email) do update
  set password_hash = excluded.password_hash,
      role          = excluded.role,
      name          = excluded.name,
      is_active     = true;

select id, name, email, role, is_active, created_at
from examcollect.account where email = ${q(email)};`);
