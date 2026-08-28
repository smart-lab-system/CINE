'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/components/layout/logout-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_GROUPS = [
  {
    label: 'Hệ thống',
    items: [{ href: '/accounts', label: 'Tài khoản' }],
  },
  {
    label: 'Dữ liệu gốc',
    items: [
      { href: '/students', label: 'Sinh viên' },
      { href: '/lecturers', label: 'Giảng viên' },
      { href: '/subjects', label: 'Môn học' },
      { href: '/academic-terms', label: 'Học kỳ' },
      { href: '/course-sections', label: 'Lớp HP' },
    ],
  },
  {
    label: 'Phòng máy',
    items: [
      { href: '/labs', label: 'Phòng máy' },
      { href: '/seating-templates', label: 'Sơ đồ mẫu' },
    ],
  },
  {
    label: 'Lịch thi',
    items: [{ href: '/exam-events', label: 'Kỳ thi' }],
  },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ onHide }: { onHide: () => void }) {
  const pathname = usePathname();

  return (
    <aside
      id="app-sidebar"
      className="flex w-60 shrink-0 flex-col border-r bg-background max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40"
    >
      <div className="flex items-start justify-between gap-2 border-b px-3 py-3">
        <div className="min-w-0 px-2 py-1">
          <Link href="/accounts" className="block font-semibold tracking-tight">
            Quản lý kiểm tra trên phòng máy
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">Cổng quản trị</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onHide}
          aria-expanded={true}
          aria-controls="app-sidebar"
          aria-label="Ẩn thanh điều hướng"
          title="Ẩn thanh điều hướng"
        >
          <SidebarCollapseIcon />
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-2 py-1.5 text-sm transition-colors',
                  isActive(pathname, item.href)
                    ? 'bg-secondary font-medium text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t px-3 py-3 [&_button]:w-full">
        <LogoutButton />
      </div>
    </aside>
  );
}

function SidebarCollapseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m16 15-3-3 3-3" />
    </svg>
  );
}
