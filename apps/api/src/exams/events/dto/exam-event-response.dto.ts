import { ApiProperty } from '@nestjs/swagger';
import {
  EXAM_EVENT_STATUSES,
  SESSION_TYPES,
} from '../../entities/exam-event.entity';
import { EXAM_FILE_ROLES } from '../../entities/exam-event-file.entity';
import { SESSION_STATUSES } from '../../entities/lab-session.entity';
import { ACTOR_TYPES } from '../../entities/exam-event-status-history.entity';

export class ExamEventSectionViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  examEventId!: string;

  @ApiProperty()
  courseSectionId!: string;

  @ApiProperty()
  subjectId!: string;
}

export class ExamEventFileViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  storedObjectId!: string;

  @ApiProperty({ enum: EXAM_FILE_ROLES })
  fileRole!: (typeof EXAM_FILE_ROLES)[number];

  @ApiProperty({ nullable: true, type: String })
  title!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  originalFilename!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ nullable: true, type: String })
  contentType!: string | null;
}

export class ExamEventSessionSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  labId!: string;

  @ApiProperty({ enum: SESSION_STATUSES })
  status!: (typeof SESSION_STATUSES)[number];
}

export class ExamEventViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  subjectId!: string;

  @ApiProperty({ enum: SESSION_TYPES })
  sessionType!: (typeof SESSION_TYPES)[number];

  @ApiProperty()
  scheduledStartAt!: string;

  @ApiProperty()
  scheduledEndAt!: string;

  @ApiProperty()
  durationMinutes!: number;

  @ApiProperty({ nullable: true, type: String })
  policyTemplateDocumentId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  policySnapshotDocumentId!: string | null;

  @ApiProperty({ enum: EXAM_EVENT_STATUSES })
  status!: (typeof EXAM_EVENT_STATUSES)[number];

  @ApiProperty({ nullable: true, type: String })
  manifestSha256!: string | null;

  @ApiProperty({ nullable: true, type: String })
  manifestPublishedAt!: string | null;

  @ApiProperty()
  rowVersion!: number;

  @ApiProperty({ nullable: true, type: String })
  createdBy!: string | null;
}

export class ExamEventDetailDto extends ExamEventViewDto {
  @ApiProperty({ type: [ExamEventSectionViewDto] })
  sections!: ExamEventSectionViewDto[];

  @ApiProperty({ type: [ExamEventFileViewDto] })
  files!: ExamEventFileViewDto[];

  @ApiProperty({ type: [ExamEventSessionSummaryDto] })
  sessions!: ExamEventSessionSummaryDto[];
}

export class ExamEventsListResponseDto {
  @ApiProperty({ type: [ExamEventViewDto] })
  items!: ExamEventViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateExamEventResponseDto {
  @ApiProperty()
  id!: string;
}

export class CreateExamEventSectionResponseDto {
  @ApiProperty()
  id!: string;
}

export class CreateExamEventFileResponseDto {
  @ApiProperty()
  id!: string;
}

export class ExamEventStatusHistoryViewDto {
  @ApiProperty({ nullable: true, enum: EXAM_EVENT_STATUSES, type: String })
  fromStatus!: (typeof EXAM_EVENT_STATUSES)[number] | null;

  @ApiProperty({ enum: EXAM_EVENT_STATUSES })
  toStatus!: (typeof EXAM_EVENT_STATUSES)[number];

  @ApiProperty()
  reason!: string;

  @ApiProperty({ enum: ACTOR_TYPES })
  actorType!: (typeof ACTOR_TYPES)[number];

  @ApiProperty({ nullable: true, type: String })
  changedBy!: string | null;

  @ApiProperty()
  commandId!: string;

  @ApiProperty()
  createdAt!: string;
}

export class ExamEventStatusHistoryListResponseDto {
  @ApiProperty({ type: [ExamEventStatusHistoryViewDto] })
  items!: ExamEventStatusHistoryViewDto[];

  @ApiProperty()
  total!: number;
}
