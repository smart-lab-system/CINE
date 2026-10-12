'use client';

import { MANY } from '@/lib/rubric-board';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { RubricPicker } from './RubricPicker';
import { RubricTabs } from './RubricTabs';

/** Trục chính của trang: chọn rubric. Ít rubric → hàng thẻ; nhiều → ô chọn có tìm kiếm (spec D7). */
export function RubricSwitcher(props: {
  overviews: RubricOverview[];
  current: RubricOverview;
  recent: string[];
  sem: string | null;
  onSem: (value: string | null) => void;
  onSelect: (name: string) => void;
  onNew: () => void;
}) {
  if (props.overviews.length > MANY) return <RubricPicker {...props} />;
  return <RubricTabs overviews={props.overviews} current={props.current.rubricName} onSelect={props.onSelect} onNew={props.onNew} />;
}
