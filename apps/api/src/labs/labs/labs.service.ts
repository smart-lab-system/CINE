import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from '../../master-data/dto/common/pagination-query.dto';
import { LabEntity } from '../entities/lab.entity';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { LabViewDto } from './dto/lab-response.dto';

@Injectable()
export class LabsService {
  constructor(
    @InjectRepository(LabEntity)
    private readonly labs: Repository<LabEntity>,
  ) {}

  async create(dto: CreateLabDto): Promise<{ id: string }> {
    const lab = await this.labs.save(
      this.labs.create({
        code: dto.code,
        name: dto.name,
        building: dto.building ?? null,
        floor: dto.floor ?? null,
        capacity: dto.capacity,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      }),
    );
    return { id: lab.id };
  }

  async search(
    query: PaginationQueryDto,
  ): Promise<{ items: LabViewDto[]; total: number }> {
    const qb = this.labs.createQueryBuilder('l').where('l.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(l.code ILIKE :term OR l.name ILIKE :term OR l.building ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    qb.orderBy('l.code', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((l) => this.toView(l)), total };
  }

  async findOne(id: string): Promise<LabViewDto> {
    return this.toView(await this.findActiveOrThrow(id));
  }

  async update(id: string, dto: UpdateLabDto): Promise<LabViewDto> {
    const lab = await this.findActiveOrThrow(id);
    await this.labs.update(id, {
      name: dto.name ?? lab.name,
      building: dto.building === undefined ? lab.building : dto.building,
      floor: dto.floor === undefined ? lab.floor : dto.floor,
      capacity: dto.capacity ?? lab.capacity,
      description:
        dto.description === undefined ? lab.description : dto.description,
      isActive: dto.isActive ?? lab.isActive,
    });
    return this.toView(await this.findActiveOrThrow(id));
  }

  async remove(id: string): Promise<void> {
    await this.findActiveOrThrow(id);
    await this.labs.update(id, { deletedAt: new Date() });
  }

  async findActiveOrThrow(id: string): Promise<LabEntity> {
    const lab = await this.labs.findOne({ where: { id } });
    if (!lab || lab.deletedAt) {
      throw new NotFoundException('Lab not found');
    }
    return lab;
  }

  private toView(lab: LabEntity): LabViewDto {
    return {
      id: lab.id,
      code: lab.code,
      name: lab.name,
      building: lab.building,
      floor: lab.floor,
      capacity: lab.capacity,
      description: lab.description,
      isActive: lab.isActive,
    };
  }
}
