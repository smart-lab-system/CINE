import type { LucideIcon } from 'lucide-react';
import { ClipboardList, FolderOpen, Info, ListChecks, Users } from 'lucide-react';
import type { SetupStepId } from './setup-draft';

export const SETUP_STEPS: {
  id: SetupStepId;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: 'info', label: 'Thông tin chung', icon: Info },
  { id: 'roster', label: 'Danh sách thi', icon: Users },
  { id: 'materials', label: 'Đề & thư mục', icon: FolderOpen },
  { id: 'rubric', label: 'Rubric', icon: ClipboardList },
  { id: 'review', label: 'Xác nhận', icon: ListChecks },
];

const STEP_IDS = new Set<SetupStepId>(SETUP_STEPS.map((step) => step.id));

/** `folder` và `schedule` là query cũ. Thiếu hoặc sai thì mở Thông tin chung. */
export function parseStep(raw: string | null): SetupStepId {
  if (raw === 'folder') return 'materials';
  if (raw === 'schedule') return 'info';
  if (raw && STEP_IDS.has(raw as SetupStepId)) return raw as SetupStepId;
  return 'info';
}

export function stepIndex(step: SetupStepId): number {
  return SETUP_STEPS.findIndex((item) => item.id === step);
}
