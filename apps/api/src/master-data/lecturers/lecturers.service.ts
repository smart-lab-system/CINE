import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { LecturerEntity } from './lecturer.entity';
import { CreateLecturerDto } from './dto/create-lecturer.dto';
import { UpdateLecturerDto } from './dto/update-lecturer.dto';
import { SearchLecturersDto } from './dto/search-lecturers.dto';
import { LecturerListItemDto, PaginatedLecturersDto } from './dto/lecturer-list-item.dto';

@Injectable()
export class LecturersService {
  constructor(
    @InjectRepository(LecturerEntity)
    private readonly lecturers: Repository<LecturerEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateLecturerDto): Promise<{ id: string }> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LecturerEntity);
      return repo.save(
        repo.create({
          employeeCode: dto.employeeCode,
          fullName: dto.fullName,
          department: dto.department ?? null,
          academicTitle: dto.academicTitle ?? null,
        }),
      );
    });
    return { id: saved.id };
  }

  async search(query: SearchLecturersDto): Promise<PaginatedLecturersDto> {
    const qb = this.lecturers.createQueryBuilder('l').where('l.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(l.employee_code ILIKE :term OR l.full_name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }

    qb.orderBy('l.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((l) => this.toView(l)), total };
  }

  async update(id: string, dto: UpdateLecturerDto): Promise<LecturerListItemDto> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LecturerEntity);
      const lecturer = await this.findActiveOrThrow(repo, id);
      await repo.update(id, {
        fullName: dto.fullName ?? lecturer.fullName,
        department: dto.department ?? lecturer.department,
        academicTitle: dto.academicTitle ?? lecturer.academicTitle,
      });
    });
    return this.toView(await this.findActiveOrThrow(this.lecturers, id));
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LecturerEntity);
      await this.findActiveOrThrow(repo, id);
      await repo.update(id, { deletedAt: new Date() });
    });
  }

  private async findActiveOrThrow(
    repo: Repository<LecturerEntity>,
    id: string,
  ): Promise<LecturerEntity> {
    const lecturer = await repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!lecturer) {
      throw new NotFoundException('Lecturer not found');
    }
    return lecturer;
  }

  private toView(lecturer: LecturerEntity): LecturerListItemDto {
    return {
      id: lecturer.id,
      employeeCode: lecturer.employeeCode,
      fullName: lecturer.fullName,
      department: lecturer.department,
      academicTitle: lecturer.academicTitle,
    };
  }
}
