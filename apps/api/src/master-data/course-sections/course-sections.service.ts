import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { CourseSectionEntity } from './course-section.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { AcademicTermEntity } from '../academic-terms/academic-term.entity';
import { CreateCourseSectionDto } from './dto/create-course-section.dto';
import { UpdateCourseSectionDto } from './dto/update-course-section.dto';
import { SearchCourseSectionsDto } from './dto/search-course-sections.dto';
import {
  CourseSectionListItemDto,
  PaginatedCourseSectionsDto,
} from './dto/course-section-list-item.dto';

@Injectable()
export class CourseSectionsService {
  constructor(
    @InjectRepository(CourseSectionEntity)
    private readonly sections: Repository<CourseSectionEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjects: Repository<SubjectEntity>,
    @InjectRepository(AcademicTermEntity)
    private readonly terms: Repository<AcademicTermEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateCourseSectionDto): Promise<{ id: string }> {
    await this.assertSubjectAndTermActive(dto.subjectId, dto.academicTermId);

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CourseSectionEntity);
      return repo.save(
        repo.create({
          subjectId: dto.subjectId,
          academicTermId: dto.academicTermId,
          sectionCode: dto.sectionCode,
          nominalClassCode: dto.nominalClassCode ?? null,
          name: dto.name ?? null,
        }),
      );
    });
    return { id: saved.id };
  }

  async search(query: SearchCourseSectionsDto): Promise<PaginatedCourseSectionsDto> {
    const qb = this.sections.createQueryBuilder('cs').where('cs.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(cs.section_code ILIKE :term OR cs.name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }
    if (query.subjectId) {
      qb.andWhere('cs.subject_id = :subjectId', { subjectId: query.subjectId });
    }
    if (query.academicTermId) {
      qb.andWhere('cs.academic_term_id = :academicTermId', {
        academicTermId: query.academicTermId,
      });
    }

    qb.orderBy('cs.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    if (rows.length === 0) {
      return { items: [], total };
    }

    // Resolve the referenced subject/term display fields with two batched
    // lookups rather than a raw SQL join — same map-stitching idiom
    // AccountsService already uses for resolving role codes, just applied
    // to two lookups instead of one.
    const subjectIds = [...new Set(rows.map((r) => r.subjectId))];
    const termIds = [...new Set(rows.map((r) => r.academicTermId))];
    const [subjects, terms] = await Promise.all([
      this.subjects.find({ where: { id: In(subjectIds) } }),
      this.terms.find({ where: { id: In(termIds) } }),
    ]);
    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    const termById = new Map(terms.map((t) => [t.id, t]));

    return { items: rows.map((row) => this.toView(row, subjectById, termById)), total };
  }

  async update(
    id: string,
    dto: UpdateCourseSectionDto,
  ): Promise<CourseSectionListItemDto> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CourseSectionEntity);
      const section = await this.findActiveOrThrow(repo, id);
      await repo.update(id, {
        nominalClassCode: dto.nominalClassCode ?? section.nominalClassCode,
        name: dto.name ?? section.name,
      });
    });

    const updated = await this.findActiveOrThrow(this.sections, id);
    const [subject, term] = await Promise.all([
      this.subjects.findOne({ where: { id: updated.subjectId } }),
      this.terms.findOne({ where: { id: updated.academicTermId } }),
    ]);
    return this.toView(
      updated,
      new Map(subject ? [[subject.id, subject]] : []),
      new Map(term ? [[term.id, term]] : []),
    );
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CourseSectionEntity);
      await this.findActiveOrThrow(repo, id);
      await repo.update(id, { deletedAt: new Date() });
    });
  }

  /** Reused by the enrollments sub-resource (Task 6) to confirm a course
   * section exists and isn't soft-deleted before adding an enrollment. */
  async assertActive(id: string): Promise<void> {
    await this.findActiveOrThrow(this.sections, id);
  }

  private async assertSubjectAndTermActive(
    subjectId: string,
    academicTermId: string,
  ): Promise<void> {
    const [subject, term] = await Promise.all([
      this.subjects.findOne({ where: { id: subjectId, deletedAt: IsNull() } }),
      this.terms.findOne({ where: { id: academicTermId, deletedAt: IsNull() } }),
    ]);
    if (!subject) {
      throw new BadRequestException('subjectId does not reference an active subject');
    }
    if (!term) {
      throw new BadRequestException(
        'academicTermId does not reference an active academic term',
      );
    }
  }

  private async findActiveOrThrow(
    repo: Repository<CourseSectionEntity>,
    id: string,
  ): Promise<CourseSectionEntity> {
    const section = await repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!section) {
      throw new NotFoundException('Course section not found');
    }
    return section;
  }

  private toView(
    section: CourseSectionEntity,
    subjectById: Map<string, SubjectEntity>,
    termById: Map<string, AcademicTermEntity>,
  ): CourseSectionListItemDto {
    const subject = subjectById.get(section.subjectId);
    const term = termById.get(section.academicTermId);
    return {
      id: section.id,
      sectionCode: section.sectionCode,
      nominalClassCode: section.nominalClassCode,
      name: section.name,
      subject: subject
        ? { id: subject.id, code: subject.code, name: subject.name }
        : { id: section.subjectId, code: '', name: '' },
      academicTerm: term
        ? { id: term.id, code: term.code, name: term.name }
        : { id: section.academicTermId, code: '', name: '' },
    };
  }
}
