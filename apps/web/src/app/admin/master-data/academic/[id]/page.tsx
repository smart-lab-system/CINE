'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

/** Legacy detail URL → list with year accordion expanded. */
export default function AcademicYearDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/master-data/academic?expand=${encodeURIComponent(id)}`);
  }, [id, router]);

  return <Skeleton className="h-64 w-full" />;
}
