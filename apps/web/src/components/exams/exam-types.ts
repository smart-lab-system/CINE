export type ExamEventStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'aborted';

export type SessionType = 'exam' | 'practice';

export type ExamFileRole =
  | 'question'
  | 'attachment'
  | 'answer_template'
  | 'guide';

export type ProctorRole = 'lead' | 'assistant';

export type ExamEventListItem = {
  id: string;
  code: string;
  title: string;
  subjectId: string;
  sessionType: SessionType;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes: number;
  status: ExamEventStatus;
  rowVersion: number;
  manifestSha256?: string | null;
  manifestPublishedAt?: string | null;
};

export type ExamEventSection = {
  id: string;
  examEventId: string;
  courseSectionId: string;
  subjectId: string;
};

export type ExamEventFile = {
  id: string;
  storedObjectId: string;
  fileRole: ExamFileRole | string;
  title: string | null;
  sortOrder: number;
  originalFilename: string;
  sizeBytes: number;
  contentType: string | null;
};

export type ExamEventSessionSummary = {
  id: string;
  code: string;
  labId: string;
  status: ExamEventStatus;
};

export type ExamEventDetail = ExamEventListItem & {
  sections: ExamEventSection[];
  files: ExamEventFile[];
  sessions: ExamEventSessionSummary[];
  policyTemplateDocumentId?: string | null;
  policySnapshotDocumentId?: string | null;
  createdBy?: string | null;
};

export type SessionProctor = {
  id: string;
  lecturerId: string;
  role: ProctorRole;
  assignedBy: string | null;
};

export type LabSessionDetail = {
  id: string;
  examEventId: string;
  code: string;
  title: string;
  labId: string;
  layoutId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: ExamEventStatus;
  rowVersion: number;
  createdBy: string | null;
  proctors: SessionProctor[];
  participantCount: number;
};

export type SessionParticipant = {
  id: string;
  sessionId: string;
  studentId: string;
  courseSectionId: string;
  layoutId: string;
  seatId: string | null;
  status: string;
  notes: string | null;
};

export type StatusHistoryRow = {
  fromStatus: ExamEventStatus | null;
  toStatus: ExamEventStatus;
  reason: string;
  actorType: string;
  changedBy: string | null;
  commandId: string;
  createdAt: string;
};

export type SubjectOption = { id: string; code: string; name: string };
export type LabOption = { id: string; code: string; name: string };
export type LayoutOption = { id: string; name: string; isActive: boolean };
export type LecturerOption = {
  id: string;
  employeeCode: string;
  fullName: string;
};
export type CourseSectionOption = {
  id: string;
  sectionCode: string;
  subjectId: string;
  termCode: string;
  name: string | null;
};
export type EnrollmentRow = {
  id: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  status: 'active' | 'dropped' | 'withdrawn';
};
