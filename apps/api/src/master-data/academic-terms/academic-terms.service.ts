import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AcademicTermEntity } from './academic-term.entity';
import { CreateAcademicTermDto } from './dto/create-academic-term.dto';
import { UpdateAcademicTermDto } from './dto/update-academic-term.dto';
import { SearchAcademicTermsDto } from './dto/search-academic-terms.dto';
import {
  AcademicTermListItemDto,
  PaginatedAcademicTermsDto,
} from './dto/academic-term-list-item.dto';

@Injectable()
export class AcademicTermsService {
  constructor(
    @InjectRepository(AcademicTermEntity)
    private readonly terms: Repository<AcademicTermEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateAcademicTermDto): Promise<{ id: string }> {
    this.assertDateOrder(dto.startsOn, dto.endsOn);

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AcademicTermEntity);
      return repo.save(
        repo.create({
          code: dto.code,
          name: dto.name,
          startsOn: dto.startsOn,
          endsOn: dto.endsOn,
        }),
      );
    });
    return { id: saved.id };
  }

  async search(query: SearchAcademicTermsDto): Promise<PaginatedAcademicTermsDto> {
    const qb = this.terms.createQueryBuilder('t').where('t.deleted_at IS NULL');

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

  async update(
    id: string,
    dto: UpdateAcademicTermDto,
  ): Promise<AcademicTermListItemDto> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AcademicTermEntity);
      const term = await this.findActiveOrThrow(repo, id);
      const startsOn = dto.startsOn ?? term.startsOn;
      const endsOn = dto.endsOn ?? term.endsOn;
      this.assertDateOrder(startsOn, endsOn);

      await repo.update(id, {
        name: dto.name ?? term.name,
        startsOn,
        endsOn,
        isActive: dto.isActive ?? term.isActive,
      });
    });
    return this.toView(await this.findActiveOrThrow(this.terms, id));
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AcademicTermEntity);
      await this.findActiveOrThrow(repo, id);
      await repo.update(id, { deletedAt: new Date() });
    });
  }

  private assertDateOrder(startsOn: string, endsOn: string): void {
    if (new Date(endsOn) < new Date(startsOn)) {
      throw new BadRequestException('endsOn must not be before startsOn');
    }
  }

  private async findActiveOrThrow(
    repo: Repository<AcademicTermEntity>,
    id: string,
  ): Promise<AcademicTermEntity> {
    const term = await repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!term) {
      throw new NotFoundException('Academic term not found');
    }
    return term;
  }

  private toView(term: AcademicTermEntity): AcademicTermListItemDto {
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
