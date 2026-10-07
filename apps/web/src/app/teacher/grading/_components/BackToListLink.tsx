'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { recalledListHref } from '@/lib/session-list-memory';

/**
 * "Đổi phiên" quay về danh sách ĐÃ LỌC mà giảng viên vừa rời. Đọc sessionStorage sau khi mount (server không
 * có nó, và đọc lúc render sẽ làm HTML server lệch HTML client); trước đó là danh sách trần.
 */
export function BackToListLink() {
  const [href, setHref] = useState('/teacher/grading');
  useEffect(() => setHref(recalledListHref()), []);
  return (
    <Button asChild variant="outline">
      <Link href={href}>Đổi phiên</Link>
    </Button>
  );
}
