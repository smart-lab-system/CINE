export type PublishChecklistInput = {
  sections: { id: string }[];
  sessions: { id: string; status: string; hasLead: boolean }[];
  files: { fileRole: string }[];
};

export type PublishChecklistItem = {
  id: 'sections' | 'sessions' | 'leads' | 'question';
  label: string;
  ok: boolean;
};

export type ExamPublishChecklist = {
  items: PublishChecklistItem[];
  ready: boolean;
};

export function examPublishChecklist(
  input: PublishChecklistInput,
): ExamPublishChecklist {
  const hasSections = input.sections.length > 0;
  const hasDraftSittings =
    input.sessions.length > 0 &&
    input.sessions.every((session) => session.status === 'draft');
  const hasLeads =
    input.sessions.length > 0 &&
    input.sessions.every((session) => session.hasLead);
  const hasQuestion = input.files.some((file) => file.fileRole === 'question');

  const items: PublishChecklistItem[] = [
    {
      id: 'sections',
      label: 'Ít nhất một lớp tham gia',
      ok: hasSections,
    },
    {
      id: 'sessions',
      label: 'Ít nhất một ca/phòng còn ở trạng thái nháp',
      ok: hasDraftSittings,
    },
    {
      id: 'leads',
      label: 'Mỗi ca có giám thị trưởng',
      ok: hasLeads,
    },
    {
      id: 'question',
      label: 'Ít nhất một file đề thi',
      ok: hasQuestion,
    },
  ];

  return { items, ready: items.every((item) => item.ok) };
}
