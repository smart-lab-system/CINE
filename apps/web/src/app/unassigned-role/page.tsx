import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LogoutButton } from '@/components/layout/logout-button';

/**
 * Where a signed-in account with no area lands.
 *
 * Deliberately outside every app shell: the shell's navigation is built per
 * area, and this page exists precisely because the account has none.
 *
 * It replaces a silent failure. Roles that no API handler accepts —
 * `super_admin` today, and whatever gets added to the enum next — used to be
 * grouped with admins and sent to /admin, where the page rendered and every
 * request on it returned 403 with nothing on screen explaining why. A person
 * cannot tell that apart from "the system is broken".
 */
export default function UnassignedRolePage() {
  return (
    <main className="app-wash flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex-row items-center gap-3">
          <span className="icon-chip h-10 w-10 bg-warning-subtle text-warning-strong">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <CardTitle className="text-h2">Tài khoản chưa được gán vai trò</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="text-body text-muted-foreground">
            Bạn đã đăng nhập thành công, nhưng vai trò của tài khoản này chưa được cấu hình
            khu vực làm việc nào trong hệ thống. Đây không phải lỗi đăng nhập và cũng không
            phải sự cố — chỉ là tài khoản chưa dùng được.
          </p>
          <Alert variant="info">
            <AlertDescription>
              Hãy liên hệ quản trị viên để được gán một trong ba vai trò: Quản trị, Trưởng
              khoa, hoặc Giảng viên.
            </AlertDescription>
          </Alert>
          <div>
            <LogoutButton />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
