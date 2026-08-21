import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { CourseSectionEnrollmentEntity } from './course-section-enrollment.entity';
import { StudentEntity } from '../../students/student.entity';
import { CourseSectionsService } from '../course-sections.service';
import { SearchEnrollmentsDto } from './dto/search-enrollments.dto';
import {
  EnrollmentListItemDto,
  PaginatedEnrollmentsDto,
} from './dto/enrollment-list-item.dto';

@Injectable()
export class CourseSectionEnrollmentsService {
  constructor(
    @InjectRepository(CourseSectionEnrollmentEntity)
    private readonly enrollments: Repository<CourseSectionEnrollmentEntity>,
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
    private readonly courseSections: CourseSectionsService,
    private readonly dataSource: DataSource,
  ) {}

  async enroll(courseSectionId: string, studentId: string): Promise<{ id: string }> {
    await this.courseSections.assertActive(courseSectionId);

    const student = await this.students.findOne({
      where: { id: studentId, deletedAt: IsNull() },
    });
    if (!student) {
      throw new BadRequestException('studentId does not reference an active student');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CourseSectionEnrollmentEntity);
      return repo.save(
        repo.create({ courseSectionId, studentId, enrolledAt: new Date() }),
      );
    });
    return { id: saved.id };
  }

  async list(
    courseSectionId: string,
    query: SearchEnrollmentsDto,
  ): Promise<PaginatedEnrollmentsDto> {
    await this.courseSections.assertActive(courseSectionId);

    const [rows, total] = await this.enrollments.findAndCount({
      where: { courseSectionId, deletedAt: IsNull() },
      order: { enrolledAt: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    if (rows.length === 0) {
      return { items: [], total };
    }

    // Same batched-lookup-plus-Map idiom as CourseSectionsService.search():
    // resolve the referenced students' display fields with one follow-up
    // query instead of a raw SQL join.
    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    const studentRows = await this.students.find({ where: { id: In(studentIds) } });
    const studentById = new Map(studentRows.map((s) => [s.id, s]));

    const items: EnrollmentListItemDto[] = rows.map((row) => {
      const student = studentById.get(row.studentId);
      return {
        id: row.id,
        enrolledAt: row.enrolledAt,
        student: student
          ? { id: student.id, studentCode: student.studentCode, fullName: student.fullName }
          : { id: row.studentId, studentCode: '', fullName: '' },
      };
    });
    return { items, total };
  }

  async unenroll(courseSectionId: string, studentId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CourseSectionEnrollmentEntity);
      const enrollment = await repo.findOne({
        where: { courseSectionId, studentId, deletedAt: IsNull() },
      });
      if (!enrollment) {
        throw new NotFoundException('Active enrollment not found');
      }
      await repo.update(enrollment.id, { deletedAt: new Date() });
    });
  }
}
