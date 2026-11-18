import type { LucideIcon } from 'lucide-react';
import { ClipboardList, FolderOpen, Info, ListChecks, Users } from 'lucide-react';
import type { SetupStepId } from './setup-draft';

export const SETUP_STEPS: {
  id: SetupStepId;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: 'info', label: 'Thông tin chung', icon: Info },
  { id: 'roster', label: 'Danh sách thí sinh', icon: Users },
  { id: 'folder', label: 'Thư mục bài làm', icon: FolderOpen },
  { id: 'exam', label: 'Đề thi & Rubric', icon: ClipboardList },
  { id: 'review', label: 'Xác nhận', icon: ListChecks },
];

const STEP_IDS = new Set<SetupStepId>(SETUP_STEPS.map((step) => step.id));

/** Alias query cũ. Thiếu hoặc sai thì mở Thông tin chung. */
export function parseStep(raw: string | null): SetupStepId {
  if (raw === 'schedule') return 'info';
  if (raw === 'materials' || raw === 'rubric') return 'exam';
  if (raw && STEP_IDS.has(raw as SetupStepId)) return raw as SetupStepId;
  return 'info';
}

export function stepIndex(step: SetupStepId): number {
  return SETUP_STEPS.findIndex((item) => item.id === step);
}
