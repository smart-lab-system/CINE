import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { SubjectEntity } from './subject.entity';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SearchSubjectsDto } from './dto/search-subjects.dto';
import { PaginatedSubjectsDto, SubjectListItemDto } from './dto/subject-list-item.dto';

@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly subjects: Repository<SubjectEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSubjectDto): Promise<{ id: string }> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SubjectEntity);
      return repo.save(
        repo.create({
          code: dto.code,
          name: dto.name,
          credits: dto.credits ?? null,
          description: dto.description ?? null,
        }),
      );
    });
    return { id: saved.id };
  }

  async search(query: SearchSubjectsDto): Promise<PaginatedSubjectsDto> {
    const qb = this.subjects.createQueryBuilder('s').where('s.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(s.code ILIKE :term OR s.name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }

    qb.orderBy('s.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((s) => this.toView(s)), total };
  }

  async update(id: string, dto: UpdateSubjectDto): Promise<SubjectListItemDto> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SubjectEntity);
      const subject = await this.findActiveOrThrow(repo, id);
      await repo.update(id, {
        name: dto.name ?? subject.name,
        credits: dto.credits ?? subject.credits,
        description: dto.description ?? subject.description,
      });
    });
    return this.toView(await this.findActiveOrThrow(this.subjects, id));
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SubjectEntity);
      await this.findActiveOrThrow(repo, id);
      await repo.update(id, { deletedAt: new Date() });
    });
  }

  private async findActiveOrThrow(
    repo: Repository<SubjectEntity>,
    id: string,
  ): Promise<SubjectEntity> {
    const subject = await repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    return subject;
  }

  private toView(subject: SubjectEntity): SubjectListItemDto {
    return {
      id: subject.id,
      code: subject.code,
      name: subject.name,
      credits: subject.credits,
      description: subject.description,
    };
  }
}
