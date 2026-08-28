import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { CourseSectionEntity } from '../../master-data/entities/course-section.entity';
import { StudentEntity } from '../../master-data/entities/student.entity';
import {
  assertRosterUploadFile,
  codesEqual,
  parseRosterOrThrow,
  ROSTER_CONTENT_TYPES,
  safeFilename,
} from '../../master-data/roster/roster-upload';
import {
  OBJECT_STORAGE,
  ObjectNotFoundError,
  ObjectStorage,
} from '../../storage/object-storage';
import { ExamEventAllowedStudentEntity } from '../entities/exam-event-allowed-student.entity';
import { ExamEventEntity } from '../entities/exam-event.entity';
import { ExamEventRosterFileEntity } from '../entities/exam-event-roster-file.entity';
import { ExamEventSectionEntity } from '../entities/exam-event-section.entity';
import { StoredObjectEntity } from '../entities/stored-object.entity';
import {
  ApplyExamRosterImportResponseDto,
  ExamRosterFileViewDto,
  ExamRosterImportPreviewDto,
} from './dto/exam-roster-import.dto';

export const EXAM_ROSTER_BUCKET = 'exam-rosters';

type AttachedSection = {
  courseSectionId: string;
  sectionCode: string;
};

@Injectable()
export class ExamRosterImportsService {
  constructor(
    @InjectRepository(ExamEventEntity)
    private readonly events: Repository<ExamEventEntity>,
    @InjectRepository(ExamEventSectionEntity)
    private readonly eventSections: Repository<ExamEventSectionEntity>,
    @InjectRepository(CourseSectionEntity)
    private readonly sections: Repository<CourseSectionEntity>,
    @InjectRepository(ExamEventRosterFileEntity)
    private readonly rosterFiles: Repository<ExamEventRosterFileEntity>,
    @InjectRepository(ExamEventAllowedStudentEntity)
    private readonly allowedStudents: Repository<ExamEventAllowedStudentEntity>,
    @InjectRepository(StoredObjectEntity)
    private readonly storedObjects: Repository<StoredObjectEntity>,
    @Inject(OBJECT_STORAGE)
    private readonly storage: ObjectStorage,
    private readonly dataSource: DataSource,
  ) {}

  async preview(
    eventId: string,
    file: { originalname: string; buffer: Buffer } | undefined,
    uploadedBy: string,
  ): Promise<ExamRosterImportPreviewDto> {
    await this.findDraftOrThrow(eventId);
    const attached = await this.loadAttachedSections(eventId);
    if (attached.length === 0) {
      throw new BadRequestException(
        'Attach at least one course section before importing a roster.',
      );
    }

    const { body, originalFilename } = assertRosterUploadFile(file);
    const parsed = parseRosterOrThrow(body);
    const match = resolveAttachedSection(parsed.sectionCodeFromFile, attached);
    const extension = extname(originalFilename).toLowerCase();
    const objectKey = `${eventId}/${randomUUID()}/${safeFilename(originalFilename)}`;
    const sha256 = createHash('sha256').update(body).digest();
    const put = await this.storage.putObject({
      bucket: examRosterBucket(),
      key: objectKey,
      body,
      contentType: ROSTER_CONTENT_TYPES[extension],
    });

    const stored = await this.storedObjects.save(
      this.storedObjects.create({
        bucketName: examRosterBucket(),
        objectKey,
        objectUri: `s3://${examRosterBucket()}/${objectKey}`,
        sha256,
        sizeBytes: String(body.length),
        contentType: ROSTER_CONTENT_TYPES[extension] ?? null,
        etag: put.etag.slice(0, 128),
        uploadedBy,
      }),
    );

    return {
      storedObjectId: stored.id,
      originalFilename,
      sectionCodeFromFile: parsed.sectionCodeFromFile,
      attachedSectionCodes: attached.map((row) => row.sectionCode),
      matchedCourseSectionId: match?.courseSectionId ?? null,
      sectionCodeMismatch: !match,
      students: parsed.students,
    };
  }

  async apply(
    eventId: string,
    storedObjectId: string,
    confirmSectionMismatch: boolean,
  ): Promise<ApplyExamRosterImportResponseDto> {
    await this.findDraftOrThrow(eventId);
    const attached = await this.loadAttachedSections(eventId);
    if (attached.length === 0) {
      throw new BadRequestException(
        'Attach at least one course section before importing a roster.',
      );
    }

    const stored = await this.storedObjects.findOne({
      where: { id: storedObjectId },
    });
    if (!stored || stored.deletedAt) {
      throw new NotFoundException('Stored object not found');
    }
    if (
      stored.bucketName !== examRosterBucket() ||
      !stored.objectKey.startsWith(`${eventId}/`)
    ) {
      throw new BadRequestException(
        'This file was not uploaded for this exam event.',
      );
    }

    let body: Buffer;
    try {
      body = await this.storage.getObject(stored.bucketName, stored.objectKey);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        throw new NotFoundException('Stored object not found');
      }
      throw error;
    }

    const parsed = parseRosterOrThrow(body);
    let match = resolveAttachedSection(parsed.sectionCodeFromFile, attached);
    if (!match) {
      if (!confirmSectionMismatch) {
        throw new ConflictException({
          message:
            'Section code in the file does not match any attached course section.',
          code: 'SECTION_CODE_MISMATCH',
          sectionCodeFromFile: parsed.sectionCodeFromFile,
          attachedSectionCodes: attached.map((row) => row.sectionCode),
        });
      }
      if (attached.length !== 1) {
        throw new BadRequestException(
          'Cannot apply roster without a matching attached course section.',
        );
      }
      match = attached[0];
    }

    const originalFilename =
      stored.objectKey.split('/').pop() || 'roster.xls';

    return this.dataSource.transaction(async (manager) => {
      const studentsRepo = manager.getRepository(StudentEntity);
      const allowedRepo = manager.getRepository(ExamEventAllowedStudentEntity);
      const filesRepo = manager.getRepository(ExamEventRosterFileEntity);

      const studentIds: string[] = [];
      let createdStudents = 0;
      let updatedStudents = 0;

      for (const row of parsed.students) {
        const matches = await studentsRepo.find({
          where: { studentCode: row.studentCode },
        });
        const existing =
          matches.find((student) => !student.deletedAt) ?? matches[0];

        if (!existing) {
          const created = await studentsRepo.save(
            studentsRepo.create({
              studentCode: row.studentCode,
              fullName: row.fullName,
              status: 'active',
            }),
          );
          createdStudents += 1;
          studentIds.push(created.id);
          continue;
        }

        const patch: Partial<StudentEntity> = {};
        if (existing.deletedAt) {
          patch.deletedAt = null;
        }
        if (existing.status !== 'active') {
          patch.status = 'active';
        }
        if (existing.fullName !== row.fullName) {
          patch.fullName = row.fullName;
          updatedStudents += 1;
        }
        if (Object.keys(patch).length > 0) {
          await studentsRepo.update(existing.id, patch);
        }
        studentIds.push(existing.id);
      }

      const active = await allowedRepo.find({
        where: {
          examEventId: eventId,
          courseSectionId: match.courseSectionId,
          deletedAt: IsNull(),
        },
      });
      const activeByStudent = new Map(
        active.map((row) => [row.studentId, row]),
      );
      const wanted = new Set(studentIds);

      let allowed = 0;
      let removed = 0;
      for (const row of active) {
        if (!wanted.has(row.studentId)) {
          await allowedRepo.update(row.id, { deletedAt: new Date() });
          removed += 1;
        }
      }
      for (const studentId of studentIds) {
        if (!activeByStudent.has(studentId)) {
          await allowedRepo.save(
            allowedRepo.create({
              examEventId: eventId,
              courseSectionId: match.courseSectionId,
              studentId,
            }),
          );
          allowed += 1;
        }
      }

      let file = await filesRepo.findOne({
        where: {
          examEventId: eventId,
          storedObjectId: stored.id,
          deletedAt: IsNull(),
        },
      });
      if (!file) {
        file = await filesRepo.save(
          filesRepo.create({
            examEventId: eventId,
            courseSectionId: match.courseSectionId,
            storedObjectId: stored.id,
            originalFilename,
          }),
        );
      }

      return {
        fileId: file.id,
        courseSectionId: match.courseSectionId,
        createdStudents,
        updatedStudents,
        allowed,
        removed,
      };
    });
  }

  async listFiles(eventId: string): Promise<{
    items: ExamRosterFileViewDto[];
    total: number;
  }> {
    await this.findActiveEventOrThrow(eventId);
    const rows = await this.rosterFiles.find({
      where: { examEventId: eventId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (rows.length === 0) {
      return { items: [], total: 0 };
    }

    const sectionIds = [...new Set(rows.map((row) => row.courseSectionId))];
    const objectIds = rows.map((row) => row.storedObjectId);
    const [sections, objects, counts] = await Promise.all([
      this.sections.find({ where: { id: In(sectionIds) } }),
      this.storedObjects.find({ where: { id: In(objectIds) } }),
      this.allowedStudents
        .createQueryBuilder('a')
        .select('a.course_section_id', 'courseSectionId')
        .addSelect('COUNT(*)', 'count')
        .where('a.exam_event_id = :eventId', { eventId })
        .andWhere('a.deleted_at IS NULL')
        .groupBy('a.course_section_id')
        .getRawMany<{ courseSectionId: string; count: string }>(),
    ]);

    const sectionById = new Map(sections.map((section) => [section.id, section]));
    const objectById = new Map(objects.map((object) => [object.id, object]));
    const countBySection = new Map(
      counts.map((row) => [row.courseSectionId, Number(row.count)]),
    );

    const items = rows.map((row) => {
      const section = sectionById.get(row.courseSectionId);
      const stored = objectById.get(row.storedObjectId);
      return {
        id: row.id,
        courseSectionId: row.courseSectionId,
        sectionCode: section?.sectionCode ?? '',
        storedObjectId: row.storedObjectId,
        originalFilename: row.originalFilename,
        sizeBytes: Number(stored?.sizeBytes ?? 0),
        contentType: stored?.contentType ?? null,
        allowedCount: countBySection.get(row.courseSectionId) ?? 0,
        createdAt: row.createdAt.toISOString(),
      };
    });
    return { items, total: items.length };
  }

  async download(
    eventId: string,
    fileId: string,
  ): Promise<{ body: Buffer; filename: string; contentType: string }> {
    await this.findActiveEventOrThrow(eventId);
    const file = await this.rosterFiles.findOne({ where: { id: fileId } });
    if (!file || file.deletedAt || file.examEventId !== eventId) {
      throw new NotFoundException('Exam roster file not found');
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
        filename: file.originalFilename,
        contentType: stored.contentType ?? 'application/octet-stream',
      };
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        throw new NotFoundException('Stored object not found');
      }
      throw error;
    }
  }

  private async loadAttachedSections(
    eventId: string,
  ): Promise<AttachedSection[]> {
    const links = await this.eventSections.find({
      where: { examEventId: eventId, deletedAt: IsNull() },
    });
    if (links.length === 0) {
      return [];
    }
    const sections = await this.sections.find({
      where: { id: In(links.map((link) => link.courseSectionId)) },
    });
    const byId = new Map(sections.map((section) => [section.id, section]));
    return links
      .map((link) => {
        const section = byId.get(link.courseSectionId);
        if (!section || section.deletedAt) {
          return null;
        }
        return {
          courseSectionId: section.id,
          sectionCode: section.sectionCode,
        };
      })
      .filter((row): row is AttachedSection => row !== null);
  }

  private async findDraftOrThrow(eventId: string): Promise<ExamEventEntity> {
    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event || event.deletedAt) {
      throw new NotFoundException('Exam event not found');
    }
    if (event.status !== 'draft') {
      throw new ConflictException(
        'Roster imports are only allowed while the exam event is draft.',
      );
    }
    return event;
  }

  private async findActiveEventOrThrow(eventId: string): Promise<ExamEventEntity> {
    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event || event.deletedAt) {
      throw new NotFoundException('Exam event not found');
    }
    return event;
  }
}

function examRosterBucket(): string {
  return process.env.MINIO_EXAM_ROSTER_BUCKET ?? EXAM_ROSTER_BUCKET;
}

function resolveAttachedSection(
  sectionCodeFromFile: string | null,
  attached: AttachedSection[],
): AttachedSection | null {
  if (!sectionCodeFromFile) {
    return null;
  }
  return (
    attached.find((row) => codesEqual(row.sectionCode, sectionCodeFromFile)) ??
    null
  );
}
