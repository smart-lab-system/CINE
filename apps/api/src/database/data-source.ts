import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { RoleEntity } from '../identity/entities/role.entity';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';
import { SubjectEntity } from '../master-data/entities/subject.entity';
import { AcademicTermEntity } from '../master-data/entities/academic-term.entity';
import { StudentEntity } from '../master-data/entities/student.entity';
import { LecturerEntity } from '../master-data/entities/lecturer.entity';
import { CourseSectionEntity } from '../master-data/entities/course-section.entity';
import { CourseSectionEnrollmentEntity } from '../master-data/entities/course-section-enrollment.entity';
import { CourseSectionFileEntity } from '../master-data/entities/course-section-file.entity';
import { LabEntity } from '../labs/entities/lab.entity';
import { WorkstationEntity } from '../labs/entities/workstation.entity';
import { LabLayoutEntity } from '../labs/entities/lab-layout.entity';
import { LabSeatEntity } from '../labs/entities/lab-seat.entity';
import { SeatingTemplateEntity } from '../labs/entities/seating-template.entity';
import { LabRoomProposalEntity } from '../labs/entities/lab-room-proposal.entity';
import { ExamEventEntity } from '../exams/entities/exam-event.entity';
import { ExamEventSectionEntity } from '../exams/entities/exam-event-section.entity';
import { ExamEventFileEntity } from '../exams/entities/exam-event-file.entity';
import { ExamEventStatusHistoryEntity } from '../exams/entities/exam-event-status-history.entity';
import { ExamEventRosterFileEntity } from '../exams/entities/exam-event-roster-file.entity';
import { ExamEventAllowedStudentEntity } from '../exams/entities/exam-event-allowed-student.entity';
import { StoredObjectEntity } from '../exams/entities/stored-object.entity';
import { LabSessionEntity } from '../exams/entities/lab-session.entity';
import { SessionProctorEntity } from '../exams/entities/session-proctor.entity';
import { SessionParticipantEntity } from '../exams/entities/session-participant.entity';
import { SessionStatusHistoryEntity } from '../exams/entities/session-status-history.entity';

// Entities are added here as they're created — starting with Task 3's
// identity entities. Migrations always run as raw SQL against the
// already-authored DDL; TypeORM never generates or alters schema here.
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  schema: process.env.DATABASE_SCHEMA ?? 'lab_management',
  entities: [
    RoleEntity,
    UserEntity,
    UserRoleEntity,
    SubjectEntity,
    AcademicTermEntity,
    StudentEntity,
    LecturerEntity,
    CourseSectionEntity,
    CourseSectionEnrollmentEntity,
    CourseSectionFileEntity,
    LabEntity,
    WorkstationEntity,
    LabLayoutEntity,
    LabSeatEntity,
    SeatingTemplateEntity,
    LabRoomProposalEntity,
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
  ],
  migrations: [__dirname + '/migrations/*.{js,ts}'],
  // The initial migration's SQL file already wraps itself in BEGIN/COMMIT
  // (it's the DBA-authored DDL, copied verbatim). Running TypeORM's own
  // transaction wrapper on top would nest a COMMIT inside TypeORM's
  // transaction and commit it early, so per-migration files own their
  // own transaction boundaries instead.
  migrationsTransactionMode: 'none',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};

export default new DataSource(dataSourceOptions);
