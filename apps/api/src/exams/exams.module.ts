import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseSectionEntity } from '../master-data/entities/course-section.entity';
import { CourseSectionEnrollmentEntity } from '../master-data/entities/course-section-enrollment.entity';
import { LecturerEntity } from '../master-data/entities/lecturer.entity';
import { SubjectEntity } from '../master-data/entities/subject.entity';
import { LabLayoutEntity } from '../labs/entities/lab-layout.entity';
import { LabSeatEntity } from '../labs/entities/lab-seat.entity';
import { ExamEventEntity } from './entities/exam-event.entity';
import { ExamEventSectionEntity } from './entities/exam-event-section.entity';
import { ExamEventFileEntity } from './entities/exam-event-file.entity';
import { ExamEventStatusHistoryEntity } from './entities/exam-event-status-history.entity';
import { ExamEventRosterFileEntity } from './entities/exam-event-roster-file.entity';
import { ExamEventAllowedStudentEntity } from './entities/exam-event-allowed-student.entity';
import { StoredObjectEntity } from './entities/stored-object.entity';
import { LabSessionEntity } from './entities/lab-session.entity';
import { SessionProctorEntity } from './entities/session-proctor.entity';
import { SessionParticipantEntity } from './entities/session-participant.entity';
import { SessionStatusHistoryEntity } from './entities/session-status-history.entity';
import { ExamEventsController } from './events/exam-events.controller';
import { ExamEventsService } from './events/exam-events.service';
import { ExamRosterImportsService } from './events/exam-roster-imports.service';
import { LabSessionsController } from './sessions/lab-sessions.controller';
import { LabSessionsService } from './sessions/lab-sessions.service';
import { StoredObjectsController } from './stored-objects/stored-objects.controller';
import { StoredObjectsService } from './stored-objects/stored-objects.service';

export const EXAM_ENTITIES = [
  ExamEventEntity,
  ExamEventSectionEntity,
  ExamEventFileEntity,
  ExamEventStatusHistoryEntity,
  ExamEventRosterFileEntity,
  ExamEventAllowedStudentEntity,
  StoredObjectEntity,
  LabSessionEntity,
  SessionProctorEntity,
  SessionParticipantEntity,
  SessionStatusHistoryEntity,
];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ...EXAM_ENTITIES,
      SubjectEntity,
      CourseSectionEntity,
      LecturerEntity,
      LabLayoutEntity,
      LabSeatEntity,
      CourseSectionEnrollmentEntity,
    ]),
  ],
  controllers: [
    ExamEventsController,
    LabSessionsController,
    StoredObjectsController,
  ],
  providers: [ExamEventsService, ExamRosterImportsService, LabSessionsService, StoredObjectsService],
})
export class ExamsModule {}
