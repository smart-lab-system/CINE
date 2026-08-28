import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { setStatusChangeContext } from '../../common/db-session-context';
import { CourseSectionEntity } from '../../master-data/entities/course-section.entity';
import { SubjectEntity } from '../../master-data/entities/subject.entity';
import {
  OBJECT_STORAGE,
  ObjectNotFoundError,
  ObjectStorage,
} from '../../storage/object-storage';
import { ExamEventEntity } from '../entities/exam-event.entity';
import {
  EXAM_FILE_ROLES,
  ExamEventFileEntity,
  ExamFileRole,
} from '../entities/exam-event-file.entity';
import { ExamEventSectionEntity } from '../entities/exam-event-section.entity';
import { ExamEventStatusHistoryEntity } from '../entities/exam-event-status-history.entity';
import { LabSessionEntity } from '../entities/lab-session.entity';
import { StoredObjectEntity } from '../entities/stored-object.entity';
import { AttachFileDto } from './dto/attach-file.dto';
import { AttachSectionDto } from './dto/attach-section.dto';
import { CreateExamEventDto } from './dto/create-exam-event.dto';
import {
  ExamEventDetailDto,
  ExamEventFileViewDto,
  ExamEventSectionViewDto,
  ExamEventSessionSummaryDto,
  ExamEventStatusHistoryViewDto,
  ExamEventViewDto,
} from './dto/exam-event-response.dto';
import { SearchExamEventsDto } from './dto/search-exam-events.dto';
import { TransitionExamEventStatusDto } from './dto/transition-status.dto';
import { UpdateExamEventDto } from './dto/update-exam-event.dto';
import {
  assertExamFileUpload,
  EXAM_FILE_CONTENT_TYPES,
  examObjectKey,
  examPackagesBucket,
} from './exam-file-upload';

@Injectable()
export class ExamEventsService {
  constructor(
    @InjectRepository(ExamEventEntity)
    private readonly events: Repository<ExamEventEntity>,
    @InjectRepository(ExamEventSectionEntity)
    private readonly eventSections: Repository<ExamEventSectionEntity>,
    @InjectRepository(ExamEventFileEntity)
    private readonly eventFiles: Repository<ExamEventFileEntity>,
    @InjectRepository(StoredObjectEntity)
    private readonly storedObjects: Repository<StoredObjectEntity>,
    @InjectRepository(LabSessionEntity)
    private readonly sessions: Repository<LabSessionEntity>,
    @InjectRepository(ExamEventStatusHistoryEntity)
    private readonly statusHistory: Repository<ExamEventStatusHistoryEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjects: Repository<SubjectEntity>,
    @InjectRepository(CourseSectionEntity)
    private readonly courseSections: Repository<CourseSectionEntity>,
    @Inject(OBJECT_STORAGE)
    private readonly storage: ObjectStorage,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateExamEventDto,
    createdBy: string,
  ): Promise<{ id: string }> {
    await this.assertActiveSubject(dto.subjectId);
    this.assertScheduleWindow(dto.scheduledStartAt, dto.scheduledEndAt);

    const event = await this.events.save(
      this.events.create({
        code: dto.code,
        title: dto.title,
        subjectId: dto.subjectId,
        sessionType: dto.sessionType,
        scheduledStartAt: new Date(dto.scheduledStartAt),
        scheduledEndAt: new Date(dto.scheduledEndAt),
        durationMinutes: dto.durationMinutes,
        policyTemplateDocumentId: dto.policyTemplateDocumentId ?? null,
        policySnapshotDocumentId: dto.policySnapshotDocumentId ?? null,
        status: 'draft',
        createdBy,
      }),
    );
    return { id: event.id };
  }

  async search(
    query: SearchExamEventsDto,
  ): Promise<{ items: ExamEventViewDto[]; total: number }> {
    const qb = this.events
      .createQueryBuilder('e')
      .where('e.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(e.code ILIKE :term OR e.title ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }
    if (query.subjectId) {
      qb.andWhere('e.subject_id = :subjectId', { subjectId: query.subjectId });
    }
    if (query.status) {
      qb.andWhere('e.status = :status', { status: query.status });
    }
    if (query.from) {
      qb.andWhere('e.scheduled_end_at > :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('e.scheduled_start_at < :to', { to: query.to });
    }

    qb.orderBy('e.scheduled_start_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((e) => this.toView(e)), total };
  }

  async findOne(id: string): Promise<ExamEventDetailDto> {
    const event = await this.findActiveOrThrow(id);
    const [sections, files, sessions] = await Promise.all([
      this.eventSections
        .createQueryBuilder('s')
        .where('s.exam_event_id = :id', { id })
        .andWhere('s.deleted_at IS NULL')
        .orderBy('s.created_at', 'ASC')
        .getMany(),
      this.eventFiles
        .createQueryBuilder('f')
        .where('f.exam_event_id = :id', { id })
        .andWhere('f.deleted_at IS NULL')
        .orderBy('f.sort_order', 'ASC')
        .addOrderBy('f.created_at', 'ASC')
        .getMany(),
      this.sessions
        .createQueryBuilder('ls')
        .where('ls.exam_event_id = :id', { id })
        .andWhere('ls.deleted_at IS NULL')
        .orderBy('ls.scheduled_start_at', 'ASC')
        .getMany(),
    ]);
    const storedObjects =
      files.length > 0
        ? await this.storedObjects.find({
            where: { id: In(files.map((file) => file.storedObjectId)) },
          })
        : [];
    const storedById = new Map(
      storedObjects.map((object) => [object.id, object]),
    );
    return {
      ...this.toView(event),
      sections: sections.map((s) => this.toSectionView(s)),
      files: files.map((f) =>
        this.toFileView(f, storedById.get(f.storedObjectId)),
      ),
      sessions: sessions.map((s) => this.toSessionSummary(s)),
    };
  }

  async update(id: string, dto: UpdateExamEventDto): Promise<ExamEventDetailDto> {
    const event = await this.findDraftOrThrow(id);
    if (toRowVersion(event.rowVersion) !== dto.rowVersion) {
      throw new ConflictException('Exam event was updated by another request');
    }

    const scheduledStartAt = dto.scheduledStartAt
      ? new Date(dto.scheduledStartAt)
      : event.scheduledStartAt;
    const scheduledEndAt = dto.scheduledEndAt
      ? new Date(dto.scheduledEndAt)
      : event.scheduledEndAt;
    this.assertScheduleWindow(scheduledStartAt, scheduledEndAt);

    await this.events.update(id, {
      code: dto.code ?? event.code,
      title: dto.title ?? event.title,
      sessionType: dto.sessionType ?? event.sessionType,
      scheduledStartAt,
      scheduledEndAt,
      durationMinutes: dto.durationMinutes ?? event.durationMinutes,
      policyTemplateDocumentId:
        dto.policyTemplateDocumentId === undefined
          ? event.policyTemplateDocumentId
          : dto.policyTemplateDocumentId,
      policySnapshotDocumentId:
        dto.policySnapshotDocumentId === undefined
          ? event.policySnapshotDocumentId
          : dto.policySnapshotDocumentId,
    });
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findDraftOrThrow(id);
    await this.events.update(id, { deletedAt: new Date() });
  }

  async attachSection(
    eventId: string,
    dto: AttachSectionDto,
  ): Promise<{ id: string }> {
    const event = await this.findDraftOrThrow(eventId);
    const section = await this.courseSections.findOne({
      where: { id: dto.courseSectionId },
    });
    if (!section || section.deletedAt) {
      throw new NotFoundException('Course section not found');
    }
    if (section.subjectId !== event.subjectId) {
      throw new BadRequestException(
        'Course section subject does not match the exam event subject',
      );
    }

    const link = await this.eventSections.save(
      this.eventSections.create({
        examEventId: event.id,
        courseSectionId: section.id,
        subjectId: event.subjectId,
      }),
    );
    return { id: link.id };
  }

  async removeSection(eventId: string, sectionLinkId: string): Promise<void> {
    await this.findDraftOrThrow(eventId);
    const link = await this.eventSections.findOne({
      where: { id: sectionLinkId },
    });
    if (!link || link.deletedAt || link.examEventId !== eventId) {
      throw new NotFoundException('Exam event section not found');
    }
    await this.eventSections.update(sectionLinkId, { deletedAt: new Date() });
  }

  async attachFile(
    eventId: string,
    dto: AttachFileDto,
  ): Promise<{ id: string }> {
    await this.findDraftOrThrow(eventId);
    const stored = await this.storedObjects.findOne({
      where: { id: dto.storedObjectId },
    });
    if (!stored || stored.deletedAt) {
      throw new NotFoundException('Stored object not found');
    }

    const file = await this.eventFiles.save(
      this.eventFiles.create({
        examEventId: eventId,
        storedObjectId: stored.id,
        fileRole: dto.fileRole,
        title: dto.title ?? null,
        sortOrder: dto.sortOrder ?? 0,
      }),
    );
    return { id: file.id };
  }

  async uploadFile(
    eventId: string,
    file: { originalname: string; buffer: Buffer } | undefined,
    input: { fileRole: ExamFileRole; title?: string; sortOrder?: number },
    uploadedBy: string,
  ): Promise<{ id: string }> {
    await this.findDraftOrThrow(eventId);
    if (!EXAM_FILE_ROLES.includes(input.fileRole)) {
      throw new BadRequestException('Invalid exam file role.');
    }

    const { body, originalFilename, extension } = assertExamFileUpload(file);
    const bucket = examPackagesBucket();
    const objectKey = examObjectKey(eventId, originalFilename);
    const sha256 = createHash('sha256').update(body).digest();
    const put = await this.storage.putObject({
      bucket,
      key: objectKey,
      body,
      contentType: EXAM_FILE_CONTENT_TYPES[extension],
    });

    const stored = await this.storedObjects.save(
      this.storedObjects.create({
        bucketName: bucket,
        objectKey,
        objectUri: `s3://${bucket}/${objectKey}`,
        sha256,
        sizeBytes: String(body.length),
        contentType: EXAM_FILE_CONTENT_TYPES[extension] ?? null,
        etag: put.etag.slice(0, 128),
        uploadedBy,
      }),
    );

    const title = input.title?.trim() || originalFilename;
    const link = await this.eventFiles.save(
      this.eventFiles.create({
        examEventId: eventId,
        storedObjectId: stored.id,
        fileRole: input.fileRole,
        title,
        sortOrder: input.sortOrder ?? 0,
      }),
    );
    return { id: link.id };
  }

  async downloadFile(
    eventId: string,
    fileId: string,
  ): Promise<{ body: Buffer; filename: string; contentType: string }> {
    await this.findActiveOrThrow(eventId);
    const file = await this.eventFiles.findOne({ where: { id: fileId } });
    if (!file || file.deletedAt || file.examEventId !== eventId) {
      throw new NotFoundException('Exam event file not found');
    }
    const stored = await this.storedObjects.findOne({
      where: { id: file.storedObjectId },
    });
    if (!stored || stored.deletedAt) {
      throw new NotFoundException('Stored object not found');
    }
    try {
      const body = await this.storage.getObject(
        stored.bucketName,
        stored.objectKey,
      );
      return {
        body,
        filename: this.fileDownloadName(file, stored),
        contentType: stored.contentType ?? 'application/octet-stream',
      };
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        throw new NotFoundException('Stored object not found');
      }
      throw error;
    }
  }

  async removeFile(eventId: string, fileId: string): Promise<void> {
    await this.findDraftOrThrow(eventId);
    const file = await this.eventFiles.findOne({ where: { id: fileId } });
    if (!file || file.deletedAt || file.examEventId !== eventId) {
      throw new NotFoundException('Exam event file not found');
    }
    await this.eventFiles.update(fileId, { deletedAt: new Date() });
  }

  async transitionStatus(
    id: string,
    dto: TransitionExamEventStatusDto,
    userId: string,
  ): Promise<ExamEventDetailDto> {
    await this.findActiveOrThrow(id);
    const commandId = randomUUID();

    await this.dataSource.transaction(async (manager) => {
      await setStatusChangeContext(manager, {
        userId,
        commandId,
        reason: dto.reason.trim(),
      });

      const result = await manager
        .createQueryBuilder()
        .update(ExamEventEntity)
        .set({ status: dto.toStatus })
        .where('id = :id', { id })
        .andWhere('row_version = :v', { v: dto.rowVersion })
        .andWhere('deleted_at IS NULL')
        .execute();

      if (!result.affected) {
        throw new ConflictException(
          'Exam event was updated by another request',
        );
      }
    });

    return this.findOne(id);
  }

  async listStatusHistory(
    id: string,
  ): Promise<{ items: ExamEventStatusHistoryViewDto[]; total: number }> {
    await this.findActiveOrThrow(id);
    const rows = await this.statusHistory.find({
      where: { examEventId: id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const items = rows.map((row) => this.toHistoryView(row));
    return { items, total: items.length };
  }

  private async assertActiveSubject(id: string): Promise<void> {
    const subject = await this.subjects.findOne({ where: { id } });
    if (!subject || subject.deletedAt) {
      throw new NotFoundException('Subject not found');
    }
  }

  private assertScheduleWindow(start: string | Date, end: string | Date): void {
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      throw new BadRequestException(
        'scheduledEndAt must be after scheduledStartAt',
      );
    }
  }

  private async findActiveOrThrow(id: string): Promise<ExamEventEntity> {
    const event = await this.events.findOne({ where: { id } });
    if (!event || event.deletedAt) {
      throw new NotFoundException('Exam event not found');
    }
    return event;
  }

  private async findDraftOrThrow(id: string): Promise<ExamEventEntity> {
    const event = await this.findActiveOrThrow(id);
    if (event.status !== 'draft') {
      throw new ConflictException(
        'Exam event can only be changed while it is draft',
      );
    }
    return event;
  }

  private toView(event: ExamEventEntity): ExamEventViewDto {
    return {
      id: event.id,
      code: event.code,
      title: event.title,
      subjectId: event.subjectId,
      sessionType: event.sessionType,
      scheduledStartAt: event.scheduledStartAt.toISOString(),
      scheduledEndAt: event.scheduledEndAt.toISOString(),
      durationMinutes: event.durationMinutes,
      policyTemplateDocumentId: event.policyTemplateDocumentId,
      policySnapshotDocumentId: event.policySnapshotDocumentId,
      status: event.status,
      manifestSha256: toSha256Hex(event.manifestSha256),
      manifestPublishedAt: event.manifestPublishedAt
        ? event.manifestPublishedAt.toISOString()
        : null,
      rowVersion: toRowVersion(event.rowVersion),
      createdBy: event.createdBy,
    };
  }

  private toSectionView(
    section: ExamEventSectionEntity,
  ): ExamEventSectionViewDto {
    return {
      id: section.id,
      examEventId: section.examEventId,
      courseSectionId: section.courseSectionId,
      subjectId: section.subjectId,
    };
  }

  private toFileView(
    file: ExamEventFileEntity,
    stored?: StoredObjectEntity,
  ): ExamEventFileViewDto {
    return {
      id: file.id,
      storedObjectId: file.storedObjectId,
      fileRole: file.fileRole,
      title: file.title,
      sortOrder: Number(file.sortOrder),
      originalFilename: this.fileDownloadName(file, stored),
      sizeBytes: stored ? Number(stored.sizeBytes) : 0,
      contentType: stored?.contentType ?? null,
    };
  }

  private fileDownloadName(
    file: ExamEventFileEntity,
    stored?: StoredObjectEntity,
  ): string {
    if (file.title?.trim()) {
      return file.title.trim();
    }
    const fromKey = stored?.objectKey.split('/').pop();
    return fromKey?.trim() || 'exam-file';
  }

  private toSessionSummary(
    session: LabSessionEntity,
  ): ExamEventSessionSummaryDto {
    return {
      id: session.id,
      code: session.code,
      labId: session.labId,
      status: session.status,
    };
  }

  private toHistoryView(
    row: ExamEventStatusHistoryEntity,
  ): ExamEventStatusHistoryViewDto {
    return {
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      reason: row.reason,
      actorType: row.actorType,
      changedBy: row.changedBy,
      commandId: row.commandId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function toRowVersion(value: number | string): number {
  return typeof value === 'string' ? Number(value) : value;
}

function toSha256Hex(value: Buffer | Uint8Array | null): string | null {
  if (!value) {
    return null;
  }
  return Buffer.from(value).toString('hex');
}
