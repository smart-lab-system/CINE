import { ApiProperty } from '@nestjs/swagger';
import { ACTOR_TYPES } from '../../entities/exam-event-status-history.entity';
import { SESSION_STATUSES, SessionStatus } from '../../entities/lab-session.entity';
import {
  PARTICIPANT_STATUSES,
  ParticipantStatus,
} from '../../entities/session-participant.entity';
import { PROCTOR_ROLES, ProctorRole } from '../../entities/session-proctor.entity';

export class SessionProctorViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  lecturerId!: string;

  @ApiProperty({ enum: PROCTOR_ROLES })
  role!: ProctorRole;

  @ApiProperty({ nullable: true, type: String })
  assignedBy!: string | null;
}

export class LabSessionViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  examEventId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  labId!: string;

  @ApiProperty()
  layoutId!: string;

  @ApiProperty()
  scheduledStartAt!: string;

  @ApiProperty()
  scheduledEndAt!: string;

  @ApiProperty({ enum: SESSION_STATUSES })
  status!: SessionStatus;

  @ApiProperty()
  rowVersion!: number;

  @ApiProperty({ nullable: true, type: String })
  createdBy!: string | null;
}

export class LabSessionDetailDto extends LabSessionViewDto {
  @ApiProperty({ type: [SessionProctorViewDto] })
  proctors!: SessionProctorViewDto[];

  @ApiProperty()
  participantCount!: number;
}

export class LabSessionsListResponseDto {
  @ApiProperty({ type: [LabSessionViewDto] })
  items!: LabSessionViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateLabSessionResponseDto {
  @ApiProperty()
  id!: string;
}

export class CreateProctorResponseDto {
  @ApiProperty()
  id!: string;
}

export class SessionParticipantViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  studentId!: string;

  @ApiProperty()
  courseSectionId!: string;

  @ApiProperty()
  layoutId!: string;

  @ApiProperty({ nullable: true, type: String })
  seatId!: string | null;

  @ApiProperty({ enum: PARTICIPANT_STATUSES })
  status!: ParticipantStatus;

  @ApiProperty({ nullable: true, type: String })
  notes!: string | null;
}

export class ParticipantsListResponseDto {
  @ApiProperty({ type: [SessionParticipantViewDto] })
  items!: SessionParticipantViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateParticipantResponseDto {
  @ApiProperty()
  id!: string;
}

export class BulkAddParticipantsResponseDto {
  @ApiProperty({ type: [String] })
  ids!: string[];
}

export class SessionStatusHistoryViewDto {
  @ApiProperty({ nullable: true, enum: SESSION_STATUSES, type: String })
  fromStatus!: SessionStatus | null;

  @ApiProperty({ enum: SESSION_STATUSES })
  toStatus!: SessionStatus;

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

export class SessionStatusHistoryListResponseDto {
  @ApiProperty({ type: [SessionStatusHistoryViewDto] })
  items!: SessionStatusHistoryViewDto[];

  @ApiProperty()
  total!: number;
}
