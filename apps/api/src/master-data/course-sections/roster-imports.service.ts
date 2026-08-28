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
import { StoredObjectEntity } from '../../exams/entities/stored-object.entity';
import {
  OBJECT_STORAGE,
  ObjectNotFoundError,
  ObjectStorage,
} from '../../storage/object-storage';
import { CourseSectionEntity } from '../entities/course-section.entity';
import { CourseSectionEnrollmentEntity } from '../entities/course-section-enrollment.entity';
import { CourseSectionFileEntity } from '../entities/course-section-file.entity';
import { StudentEntity } from '../entities/student.entity';
import {
  assertRosterUploadFile,
  codesEqual,
  MAX_ROSTER_FILE_BYTES,
  parseRosterOrThrow,
  ROSTER_CONTENT_TYPES,
  safeFilename,
} from '../roster/roster-upload';
import {
  ApplyRosterImportResponseDto,
  CourseSectionFileViewDto,
  RosterImportPreviewDto,
} from './dto/roster-import.dto';

export const ROSTER_BUCKET = 'course-rosters';
export { MAX_ROSTER_FILE_BYTES };

@Injectable()
export class RosterImportsService {
  constructor(
    @InjectRepository(CourseSectionEntity)
    private readonly sections: Repository<CourseSectionEntity>,
    @InjectRepository(CourseSectionFileEntity)
    private readonly files: Repository<CourseSectionFileEntity>,
    @InjectRepository(StoredObjectEntity)
    private readonly storedObjects: Repository<StoredObjectEntity>,
    @Inject(OBJECT_STORAGE)
    private readonly storage: ObjectStorage,
    private readonly dataSource: DataSource,
  ) {}

  async preview(
    sectionId: string,
    file: { originalname: string; buffer: Buffer } | undefined,
    uploadedBy: string,
  ): Promise<RosterImportPreviewDto> {
    const section = await this.findActiveSectionOrThrow(sectionId);
    const { body, originalFilename } = assertRosterUploadFile(file);
    const parsed = parseRosterOrThrow(body);
    const extension = extname(originalFilename).toLowerCase();
    const objectKey = `${section.id}/${randomUUID()}/${safeFilename(originalFilename)}`;
    const sha256 = createHash('sha256').update(body).digest();
    const put = await this.storage.putObject({
      bucket: rosterBucket(),
      key: objectKey,
      body,
      contentType: ROSTER_CONTENT_TYPES[extension],
    });

    const stored = await this.storedObjects.save(
      this.storedObjects.create({
        bucketName: rosterBucket(),
        objectKey,
        objectUri: `s3://${rosterBucket()}/${objectKey}`,
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
      sectionCodeMismatch: isSectionMismatch(
        parsed.sectionCodeFromFile,
        section.sectionCode,
      ),
      students: parsed.students,
    };
  }

  async apply(
    sectionId: string,
    storedObjectId: string,
    confirmSectionMismatch: boolean,
  ): Promise<ApplyRosterImportResponseDto> {
    const section = await this.findActiveSectionOrThrow(sectionId);
    const stored = await this.storedObjects.findOne({
      where: { id: storedObjectId },
    });
    if (!stored || stored.deletedAt) {
      throw new NotFoundException('Stored object not found');
    }
    if (
      stored.bucketName !== rosterBucket() ||
      !stored.objectKey.startsWith(`${section.id}/`)
    ) {
      throw new BadRequestException(
        'This file was not uploaded for this course section.',
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
    const mismatch = isSectionMismatch(
      parsed.sectionCodeFromFile,
      section.sectionCode,
    );
    if (mismatch && !confirmSectionMismatch) {
      throw new ConflictException({
        message:
          'Section code in the file does not match this course section.',
        code: 'SECTION_CODE_MISMATCH',
        sectionCodeFromFile: parsed.sectionCodeFromFile,
        sectionCode: section.sectionCode,
      });
    }

    if (
      section.maxEnrollment != null &&
      parsed.students.length > section.maxEnrollment
    ) {
      throw new BadRequestException(
        `Enrollment would exceed max capacity of ${section.maxEnrollment}`,
      );
    }

    const originalFilename =
      stored.objectKey.split('/').pop() || 'roster.xls';

    return this.dataSource.transaction(async (manager) => {
      const studentsRepo = manager.getRepository(StudentEntity);
      const enrollmentsRepo = manager.getRepository(
        CourseSectionEnrollmentEntity,
      );
      const filesRepo = manager.getRepository(CourseSectionFileEntity);

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

      const active = await enrollmentsRepo.find({
        where: {
          courseSectionId: section.id,
          status: 'active',
          deletedAt: IsNull(),
        },
      });
      const activeByStudent = new Map(
        active.map((enrollment) => [enrollment.studentId, enrollment]),
      );
      const wanted = new Set(studentIds);

      let enrolled = 0;
      let unenrolled = 0;
      for (const enrollment of active) {
        if (!wanted.has(enrollment.studentId)) {
          await enrollmentsRepo.update(enrollment.id, {
            status: 'dropped',
            deletedAt: new Date(),
          });
          unenrolled += 1;
        }
      }
      for (const studentId of studentIds) {
        if (!activeByStudent.has(studentId)) {
          await enrollmentsRepo.save(
            enrollmentsRepo.create({
              courseSectionId: section.id,
              studentId,
              enrolledAt: new Date(),
              status: 'active',
            }),
          );
          enrolled += 1;
        }
      }

      let file = await filesRepo.findOne({
        where: {
          courseSectionId: section.id,
          storedObjectId: stored.id,
          deletedAt: IsNull(),
        },
      });
      if (!file) {
        file = await filesRepo.save(
          filesRepo.create({
            courseSectionId: section.id,
            storedObjectId: stored.id,
            originalFilename,
          }),
        );
      }

      return {
        fileId: file.id,
        createdStudents,
        updatedStudents,
        enrolled,
        unenrolled,
      };
    });
  }

  async listFiles(sectionId: string): Promise<{
    items: CourseSectionFileViewDto[];
    total: number;
  }> {
    await this.findActiveSectionOrThrow(sectionId);
    const rows = await this.files.find({
      where: { courseSectionId: sectionId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    const objects =
      rows.length > 0
        ? await this.storedObjects.find({
            where: { id: In(rows.map((row) => row.storedObjectId)) },
          })
        : [];
    const byId = new Map(objects.map((object) => [object.id, object]));
    const items = rows.map((row) => {
      const stored = byId.get(row.storedObjectId);
      return {
        id: row.id,
        storedObjectId: row.storedObjectId,
        originalFilename: row.originalFilename,
        sizeBytes: Number(stored?.sizeBytes ?? 0),
        contentType: stored?.contentType ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });
    return { items, total: items.length };
  }

  async download(
    sectionId: string,
    fileId: string,
  ): Promise<{ body: Buffer; filename: string; contentType: string }> {
    await this.findActiveSectionOrThrow(sectionId);
    const file = await this.files.findOne({ where: { id: fileId } });
    if (!file || file.deletedAt || file.courseSectionId !== sectionId) {
      throw new NotFoundException('Course section file not found');
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

  private async findActiveSectionOrThrow(
    id: string,
  ): Promise<CourseSectionEntity> {
    const section = await this.sections.findOne({ where: { id } });
    if (!section || section.deletedAt) {
      throw new NotFoundException('Course section not found');
    }
    return section;
  }
}

function rosterBucket(): string {
  return process.env.MINIO_ROSTER_BUCKET ?? ROSTER_BUCKET;
}

function isSectionMismatch(
  fromFile: string | null,
  sectionCode: string,
): boolean {
  if (!fromFile) {
    return true;
  }
  return !codesEqual(fromFile, sectionCode);
}
