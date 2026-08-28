import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';

interface PlaceholderPageProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/**
 * A structured "sắp có" state for a nav item whose real page hasn't been
 * built yet — a real route, real title, real layout, instead of a missing
 * menu entry or a blank page. Replaced by the real page's content in a
 * later phase; the nav link never dangles in the meantime.
 *
 * The badge in the header is the honest part: it says the screen is
 * unfinished rather than leaving a visitor to wonder whether the module is
 * broken or their account lacks permission.
 */
export function PlaceholderPage({ icon: Icon, title, description }: PlaceholderPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        title={title}
        actions={<Badge variant="warning">Đang phát triển</Badge>}
      />
      <Card data-animate>
        <EmptyState icon={Icon} title="Màn hình này chưa sẵn sàng" description={description} tone="muted" />
      </Card>
    </div>
  );
}
