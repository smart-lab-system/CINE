import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { getMetadataArgsStorage } from 'typeorm';
import { AppModule } from '../app.module';
import { dataSourceOptions } from '../database/data-source';
import { ExamEventEntity } from './entities/exam-event.entity';
import { ExamEventSectionEntity } from './entities/exam-event-section.entity';
import { ExamEventFileEntity } from './entities/exam-event-file.entity';
import { ExamEventStatusHistoryEntity } from './entities/exam-event-status-history.entity';
import { StoredObjectEntity } from './entities/stored-object.entity';
import { LabSessionEntity } from './entities/lab-session.entity';
import { SessionProctorEntity } from './entities/session-proctor.entity';
import { SessionParticipantEntity } from './entities/session-participant.entity';
import { SessionStatusHistoryEntity } from './entities/session-status-history.entity';
import { ExamsModule } from './exams.module';

const EXAM_ENTITIES = [
  ExamEventEntity,
  ExamEventSectionEntity,
  ExamEventFileEntity,
  ExamEventStatusHistoryEntity,
  StoredObjectEntity,
  LabSessionEntity,
  SessionProctorEntity,
  SessionParticipantEntity,
  SessionStatusHistoryEntity,
];

function tableName(entity: Function): string | undefined {
  return getMetadataArgsStorage().tables.find((t) => t.target === entity)?.name;
}

function dbColumnNames(entity: Function): string[] {
  return getMetadataArgsStorage()
    .columns.filter((c) => c.target === entity)
    .map((c) =>
      typeof c.options?.name === 'string' ? c.options.name : c.propertyName,
    );
}

function columnOptions(entity: Function, propertyName: string) {
  return getMetadataArgsStorage().columns.find(
    (c) => c.target === entity && c.propertyName === propertyName,
  )?.options;
}

describe('exam TypeORM entities', () => {
  it('maps each entity to the matching DDL table name', () => {
    expect(tableName(ExamEventEntity)).toBe('exam_events');
    expect(tableName(ExamEventSectionEntity)).toBe('exam_event_sections');
    expect(tableName(ExamEventFileEntity)).toBe('exam_event_files');
    expect(tableName(ExamEventStatusHistoryEntity)).toBe(
      'exam_event_status_history',
    );
    expect(tableName(StoredObjectEntity)).toBe('stored_objects');
    expect(tableName(LabSessionEntity)).toBe('lab_sessions');
    expect(tableName(SessionProctorEntity)).toBe('session_proctors');
    expect(tableName(SessionParticipantEntity)).toBe('session_participants');
    expect(tableName(SessionStatusHistoryEntity)).toBe(
      'session_status_history',
    );
  });

  it('maps exam_events columns with DDL names including scheduled_start_at and row_version', () => {
    const columns = dbColumnNames(ExamEventEntity);
    expect(columns).toEqual(
      expect.arrayContaining([
        'code',
        'title',
        'subject_id',
        'session_type',
        'scheduled_start_at',
        'scheduled_end_at',
        'schedule_window',
        'duration_minutes',
        'policy_template_document_id',
        'policy_snapshot_document_id',
        'status',
        'actual_start_at',
        'actual_end_at',
        'manifest_sha256',
        'manifest_published_at',
        'row_version',
        'created_by',
        'created_at',
        'updated_at',
        'deleted_at',
      ]),
    );

    expect(columnOptions(ExamEventEntity, 'scheduleWindow')).toMatchObject({
      insert: false,
      update: false,
    });
  });

  it('maps lab_sessions columns with DDL names including scheduled_start_at and row_version', () => {
    const columns = dbColumnNames(LabSessionEntity);
    expect(columns).toEqual(
      expect.arrayContaining([
        'exam_event_id',
        'code',
        'title',
        'lab_id',
        'layout_id',
        'scheduled_start_at',
        'scheduled_end_at',
        'schedule_window',
        'status',
        'actual_start_at',
        'actual_end_at',
        'row_version',
        'created_by',
        'deleted_at',
      ]),
    );
  });

  it('maps stored_objects.sha256 as bytea and child-table FK columns', () => {
    expect(columnOptions(StoredObjectEntity, 'sha256')).toMatchObject({
      name: 'sha256',
      type: 'bytea',
    });
    expect(dbColumnNames(ExamEventSectionEntity)).toEqual(
      expect.arrayContaining([
        'exam_event_id',
        'course_section_id',
        'subject_id',
        'deleted_at',
      ]),
    );
    expect(dbColumnNames(ExamEventFileEntity)).toEqual(
      expect.arrayContaining([
        'exam_event_id',
        'stored_object_id',
        'file_role',
        'sort_order',
      ]),
    );
    expect(dbColumnNames(SessionProctorEntity)).toEqual(
      expect.arrayContaining(['session_id', 'lecturer_id', 'role', 'assigned_by']),
    );
    expect(dbColumnNames(SessionParticipantEntity)).toEqual(
      expect.arrayContaining([
        'session_id',
        'layout_id',
        'course_section_id',
        'student_id',
        'seat_id',
        'status',
      ]),
    );
    expect(dbColumnNames(ExamEventStatusHistoryEntity)).toEqual(
      expect.arrayContaining([
        'exam_event_id',
        'from_status',
        'to_status',
        'reason',
        'actor_type',
        'changed_by',
        'command_id',
      ]),
    );
    expect(dbColumnNames(SessionStatusHistoryEntity)).toEqual(
      expect.arrayContaining([
        'session_id',
        'from_status',
        'to_status',
        'reason',
        'actor_type',
        'changed_by',
        'command_id',
      ]),
    );
  });

  it('does not declare Check or exclusion constraints on exam entities', () => {
    const storage = getMetadataArgsStorage();
    const targets = new Set<Function>(EXAM_ENTITIES);
    expect(storage.checks.filter((c) => targets.has(c.target as Function))).toEqual(
      [],
    );
    expect(
      storage.exclusions.filter((c) => targets.has(c.target as Function)),
    ).toEqual([]);
  });

  it('registers every exam entity on dataSourceOptions', () => {
    expect(dataSourceOptions.synchronize).toBe(false);
    for (const entity of EXAM_ENTITIES) {
      expect(dataSourceOptions.entities).toContain(entity);
    }
  });

  it('imports ExamsModule from AppModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as
      | unknown[]
      | undefined;
    expect(imports).toContain(ExamsModule);
  });
});
