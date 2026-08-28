import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcademicTermEntity } from '../entities/academic-term.entity';
import { PaginationQueryDto } from '../dto/common/pagination-query.dto';
import { CreateAcademicTermDto } from './dto/create-academic-term.dto';
import { UpdateAcademicTermDto } from './dto/update-academic-term.dto';
import { AcademicTermViewDto } from './dto/academic-term-response.dto';

@Injectable()
export class AcademicTermsService {
  constructor(
    @InjectRepository(AcademicTermEntity)
    private readonly terms: Repository<AcademicTermEntity>,
  ) {}

  async create(dto: CreateAcademicTermDto): Promise<{ id: string }> {
    this.assertDateOrder(dto.startsOn, dto.endsOn);
    const term = await this.terms.save(
      this.terms.create({
        code: dto.code,
        name: dto.name,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
        isActive: dto.isActive ?? true,
      }),
    );
    return { id: term.id };
  }

  async search(
    query: PaginationQueryDto,
  ): Promise<{ items: AcademicTermViewDto[]; total: number }> {
    const qb = this.terms
      .createQueryBuilder('t')
      .where('t.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(t.code ILIKE :term OR t.name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }

    qb.orderBy('t.starts_on', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((t) => this.toView(t)), total };
  }

  async findOne(id: string): Promise<AcademicTermViewDto> {
    return this.toView(await this.findActiveOrThrow(id));
  }

  async update(
    id: string,
    dto: UpdateAcademicTermDto,
  ): Promise<AcademicTermViewDto> {
    const term = await this.findActiveOrThrow(id);
    const startsOn = dto.startsOn ?? term.startsOn;
    const endsOn = dto.endsOn ?? term.endsOn;
    this.assertDateOrder(startsOn, endsOn);

    await this.terms.update(id, {
      name: dto.name ?? term.name,
      startsOn,
      endsOn,
      isActive: dto.isActive ?? term.isActive,
    });
    return this.toView(await this.findActiveOrThrow(id));
  }

  async remove(id: string): Promise<void> {
    await this.findActiveOrThrow(id);
    await this.terms.update(id, { deletedAt: new Date() });
  }

  private assertDateOrder(startsOn: string, endsOn: string): void {
    if (endsOn < startsOn) {
      throw new BadRequestException('endsOn must be on or after startsOn');
    }
  }

  private async findActiveOrThrow(id: string): Promise<AcademicTermEntity> {
    const term = await this.terms.findOne({ where: { id } });
    if (!term || term.deletedAt) {
      throw new NotFoundException('Academic term not found');
    }
    return term;
  }

  private toView(term: AcademicTermEntity): AcademicTermViewDto {
    return {
      id: term.id,
      code: term.code,
      name: term.name,
      startsOn: term.startsOn,
      endsOn: term.endsOn,
      isActive: term.isActive,
    };
  }
}
