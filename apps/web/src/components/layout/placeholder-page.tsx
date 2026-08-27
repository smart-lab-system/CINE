import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

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
 */
export function PlaceholderPage({ icon: Icon, title, description }: PlaceholderPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="font-medium">Sắp có</p>
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
