import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubjectEntity } from '../entities/subject.entity';
import { PaginationQueryDto } from '../dto/common/pagination-query.dto';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectViewDto } from './dto/subject-response.dto';

@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly subjects: Repository<SubjectEntity>,
  ) {}

  async create(dto: CreateSubjectDto): Promise<{ id: string }> {
    const subject = await this.subjects.save(
      this.subjects.create({
        code: dto.code,
        name: dto.name,
        credits: dto.credits ?? null,
        description: dto.description ?? null,
      }),
    );
    return { id: subject.id };
  }

  async search(
    query: PaginationQueryDto,
  ): Promise<{ items: SubjectViewDto[]; total: number }> {
    const qb = this.subjects
      .createQueryBuilder('s')
      .where('s.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(s.code ILIKE :term OR s.name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }

    qb.orderBy('s.code', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((s) => this.toView(s)), total };
  }

  async findOne(id: string): Promise<SubjectViewDto> {
    return this.toView(await this.findActiveOrThrow(id));
  }

  async update(id: string, dto: UpdateSubjectDto): Promise<SubjectViewDto> {
    const subject = await this.findActiveOrThrow(id);
    await this.subjects.update(id, {
      name: dto.name ?? subject.name,
      credits: dto.credits === undefined ? subject.credits : dto.credits,
      description:
        dto.description === undefined ? subject.description : dto.description,
    });
    return this.toView(await this.findActiveOrThrow(id));
  }

  async remove(id: string): Promise<void> {
    await this.findActiveOrThrow(id);
    await this.subjects.update(id, { deletedAt: new Date() });
  }

  private async findActiveOrThrow(id: string): Promise<SubjectEntity> {
    const subject = await this.subjects.findOne({ where: { id } });
    if (!subject || subject.deletedAt) {
      throw new NotFoundException('Subject not found');
    }
    return subject;
  }

  private toView(subject: SubjectEntity): SubjectViewDto {
    return {
      id: subject.id,
      code: subject.code,
      name: subject.name,
      credits: subject.credits,
      description: subject.description,
    };
  }
}
