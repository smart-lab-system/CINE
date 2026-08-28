import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AcademicTermEntity } from '../entities/academic-term.entity';
import { CourseSectionEntity } from '../entities/course-section.entity';
import { CourseSectionEnrollmentEntity } from '../entities/course-section-enrollment.entity';
import { LecturerEntity } from '../entities/lecturer.entity';
import { StudentEntity } from '../entities/student.entity';
import { SubjectEntity } from '../entities/subject.entity';
import { CreateCourseSectionDto } from './dto/create-course-section.dto';
import { UpdateCourseSectionDto } from './dto/update-course-section.dto';
import { SearchCourseSectionsDto } from './dto/search-course-sections.dto';
import {
  CourseSectionViewDto,
  EnrollmentViewDto,
} from './dto/course-section-response.dto';

@Injectable()
export class CourseSectionsService {
  constructor(
    @InjectRepository(CourseSectionEntity)
    private readonly sections: Repository<CourseSectionEntity>,
    @InjectRepository(CourseSectionEnrollmentEntity)
    private readonly enrollments: Repository<CourseSectionEnrollmentEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjects: Repository<SubjectEntity>,
    @InjectRepository(AcademicTermEntity)
    private readonly terms: Repository<AcademicTermEntity>,
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
    @InjectRepository(LecturerEntity)
    private readonly lecturers: Repository<LecturerEntity>,
  ) {}

  async create(dto: CreateCourseSectionDto): Promise<{ id: string }> {
    await this.assertActiveSubject(dto.subjectId);
    await this.assertActiveTerm(dto.academicTermId);
    if (dto.lecturerId) {
      await this.assertActiveLecturer(dto.lecturerId);
    }

    const section = await this.sections.save(
      this.sections.create({
        subjectId: dto.subjectId,
        academicTermId: dto.academicTermId,
        sectionCode: dto.sectionCode,
        nominalClassCode: dto.nominalClassCode ?? null,
        name: dto.name ?? null,
        lecturerId: dto.lecturerId ?? null,
        maxEnrollment: dto.maxEnrollment ?? null,
      }),
    );
    return { id: section.id };
  }

  async search(
    query: SearchCourseSectionsDto,
  ): Promise<{ items: CourseSectionViewDto[]; total: number }> {
    const qb = this.sections
      .createQueryBuilder('cs')
      .where('cs.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(cs.section_code ILIKE :term OR cs.name ILIKE :term OR cs.nominal_class_code ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }
    if (query.subjectId) {
      qb.andWhere('cs.subject_id = :subjectId', { subjectId: query.subjectId });
    }
    if (query.academicTermId) {
      qb.andWhere('cs.academic_term_id = :academicTermId', {
        academicTermId: query.academicTermId,
      });
    }

    qb.orderBy('cs.section_code', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    const items = await Promise.all(rows.map((s) => this.toSectionView(s)));
    return { items, total };
  }

  async findOne(id: string): Promise<CourseSectionViewDto> {
    const section = await this.findActiveSectionOrThrow(id);
    return this.toSectionView(section);
  }

  async update(
    id: string,
    dto: UpdateCourseSectionDto,
  ): Promise<CourseSectionViewDto> {
    const section = await this.findActiveSectionOrThrow(id);
    if (dto.lecturerId) {
      await this.assertActiveLecturer(dto.lecturerId);
    }

    await this.sections.update(id, {
      nominalClassCode:
        dto.nominalClassCode === undefined
          ? section.nominalClassCode
          : dto.nominalClassCode,
      name: dto.name === undefined ? section.name : dto.name,
      lecturerId:
        dto.lecturerId === undefined ? section.lecturerId : dto.lecturerId,
      maxEnrollment:
        dto.maxEnrollment === undefined
          ? section.maxEnrollment
          : dto.maxEnrollment,
    });
    return this.toSectionView(await this.findActiveSectionOrThrow(id));
  }

  async remove(id: string): Promise<void> {
    await this.findActiveSectionOrThrow(id);
    await this.sections.update(id, { deletedAt: new Date() });
  }

  async listEnrollments(
    sectionId: string,
  ): Promise<{ items: EnrollmentViewDto[]; total: number }> {
    await this.findActiveSectionOrThrow(sectionId);

    const rows = await this.enrollments
      .createQueryBuilder('e')
      .where('e.course_section_id = :sectionId', { sectionId })
      .andWhere('e.deleted_at IS NULL')
      .orderBy('e.enrolled_at', 'ASC')
      .getMany();

    const studentIds = rows.map((r) => r.studentId);
    const students =
      studentIds.length > 0
        ? await this.students.find({ where: { id: In(studentIds) } })
        : [];
    const byId = new Map(students.map((s) => [s.id, s]));

    const items = rows.map((e) => {
      const student = byId.get(e.studentId);
      return {
        id: e.id,
        courseSectionId: e.courseSectionId,
        studentId: e.studentId,
        studentCode: student?.studentCode ?? '',
        fullName: student?.fullName ?? '',
        status: e.status,
        enrolledAt: e.enrolledAt.toISOString(),
      };
    });

    return { items, total: items.length };
  }

  async enroll(
    sectionId: string,
    studentId: string,
  ): Promise<{ id: string }> {
    const section = await this.findActiveSectionOrThrow(sectionId);
    await this.assertEnrollableStudent(studentId);
    await this.assertEnrollmentCapacity(section, 1);

    const enrollment = await this.enrollments.save(
      this.enrollments.create({
        courseSectionId: sectionId,
        studentId,
        enrolledAt: new Date(),
        status: 'active',
      }),
    );
    return { id: enrollment.id };
  }

  async bulkEnroll(
    sectionId: string,
    studentIds: string[],
  ): Promise<{ ids: string[] }> {
    const section = await this.findActiveSectionOrThrow(sectionId);
    const uniqueIds = [...new Set(studentIds)];
    for (const studentId of uniqueIds) {
      await this.assertEnrollableStudent(studentId);
    }
    await this.assertEnrollmentCapacity(section, uniqueIds.length);

    const saved = await this.enrollments.save(
      uniqueIds.map((studentId) =>
        this.enrollments.create({
          courseSectionId: sectionId,
          studentId,
          enrolledAt: new Date(),
          status: 'active',
        }),
      ),
    );
    return { ids: saved.map((e) => e.id) };
  }

  async unenroll(sectionId: string, enrollmentId: string): Promise<void> {
    await this.findActiveSectionOrThrow(sectionId);
    const enrollment = await this.enrollments.findOne({
      where: { id: enrollmentId },
    });
    if (
      !enrollment ||
      enrollment.deletedAt ||
      enrollment.courseSectionId !== sectionId
    ) {
      throw new NotFoundException('Enrollment not found');
    }
    await this.enrollments.update(enrollmentId, {
      status: 'dropped',
      deletedAt: new Date(),
    });
  }

  private async assertActiveSubject(id: string): Promise<void> {
    const subject = await this.subjects.findOne({ where: { id } });
    if (!subject || subject.deletedAt) {
      throw new NotFoundException('Subject not found');
    }
  }

  private async assertActiveTerm(id: string): Promise<void> {
    const term = await this.terms.findOne({ where: { id } });
    if (!term || term.deletedAt) {
      throw new NotFoundException('Academic term not found');
    }
  }

  private async assertActiveLecturer(id: string): Promise<void> {
    const lecturer = await this.lecturers.findOne({ where: { id } });
    if (!lecturer || lecturer.deletedAt) {
      throw new NotFoundException('Lecturer not found');
    }
  }

  private async assertEnrollableStudent(id: string): Promise<void> {
    const student = await this.students.findOne({ where: { id } });
    if (!student || student.deletedAt) {
      throw new NotFoundException('Student not found');
    }
    if (student.status !== 'active') {
      throw new BadRequestException(
        'Only active students can be enrolled in a course section',
      );
    }
  }

  private async assertEnrollmentCapacity(
    section: CourseSectionEntity,
    additional: number,
  ): Promise<void> {
    if (section.maxEnrollment == null) {
      return;
    }
    const current = await this.enrollments
      .createQueryBuilder('e')
      .where('e.course_section_id = :sectionId', { sectionId: section.id })
      .andWhere('e.deleted_at IS NULL')
      .andWhere('e.status = :status', { status: 'active' })
      .getCount();
    if (current + additional > section.maxEnrollment) {
      throw new BadRequestException(
        `Enrollment would exceed max capacity of ${section.maxEnrollment}`,
      );
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

  private async toSectionView(
    section: CourseSectionEntity,
  ): Promise<CourseSectionViewDto> {
    const [subject, term, lecturer] = await Promise.all([
      this.subjects.findOne({ where: { id: section.subjectId } }),
      this.terms.findOne({ where: { id: section.academicTermId } }),
      section.lecturerId
        ? this.lecturers.findOne({ where: { id: section.lecturerId } })
        : Promise.resolve(null),
    ]);
    return {
      id: section.id,
      subjectId: section.subjectId,
      subjectCode: subject?.code ?? '',
      subjectName: subject?.name ?? '',
      academicTermId: section.academicTermId,
      termCode: term?.code ?? '',
      termName: term?.name ?? '',
      sectionCode: section.sectionCode,
      nominalClassCode: section.nominalClassCode,
      name: section.name,
      lecturerId: section.lecturerId,
      lecturerCode: lecturer?.employeeCode ?? null,
      lecturerName: lecturer?.fullName ?? null,
      maxEnrollment: section.maxEnrollment,
    };
  }
}
