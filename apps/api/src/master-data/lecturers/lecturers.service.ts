import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../identity/entities/user.entity';
import { LecturerEntity } from '../entities/lecturer.entity';
import { PaginationQueryDto } from '../dto/common/pagination-query.dto';
import { CreateLecturerDto } from './dto/create-lecturer.dto';
import { UpdateLecturerDto } from './dto/update-lecturer.dto';
import { LecturerViewDto } from './dto/lecturer-response.dto';

@Injectable()
export class LecturersService {
  constructor(
    @InjectRepository(LecturerEntity)
    private readonly lecturers: Repository<LecturerEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async create(dto: CreateLecturerDto): Promise<{ id: string }> {
    if (dto.userId) {
      await this.assertActiveUser(dto.userId);
    }
    const lecturer = await this.lecturers.save(
      this.lecturers.create({
        employeeCode: dto.employeeCode,
        fullName: dto.fullName,
        userId: dto.userId ?? null,
        department: dto.department ?? null,
        academicTitle: dto.academicTitle ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
      }),
    );
    return { id: lecturer.id };
  }

  async search(
    query: PaginationQueryDto,
  ): Promise<{ items: LecturerViewDto[]; total: number }> {
    const qb = this.lecturers
      .createQueryBuilder('l')
      .where('l.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(l.employee_code ILIKE :term OR l.full_name ILIKE :term OR l.department ILIKE :term OR l.email ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    qb.orderBy('l.employee_code', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((l) => this.toView(l)), total };
  }

  async findOne(id: string): Promise<LecturerViewDto> {
    return this.toView(await this.findActiveOrThrow(id));
  }

  async update(id: string, dto: UpdateLecturerDto): Promise<LecturerViewDto> {
    const lecturer = await this.findActiveOrThrow(id);
    if (dto.userId) {
      await this.assertActiveUser(dto.userId);
    }

    await this.lecturers.update(id, {
      fullName: dto.fullName ?? lecturer.fullName,
      userId: dto.userId === undefined ? lecturer.userId : dto.userId,
      department:
        dto.department === undefined ? lecturer.department : dto.department,
      academicTitle:
        dto.academicTitle === undefined
          ? lecturer.academicTitle
          : dto.academicTitle,
      email: dto.email === undefined ? lecturer.email : dto.email,
      phone: dto.phone === undefined ? lecturer.phone : dto.phone,
    });
    return this.toView(await this.findActiveOrThrow(id));
  }

  async remove(id: string): Promise<void> {
    await this.findActiveOrThrow(id);
    await this.lecturers.update(id, { deletedAt: new Date() });
  }

  private async assertActiveUser(userId: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Linked user not found');
    }
  }

  private async findActiveOrThrow(id: string): Promise<LecturerEntity> {
    const lecturer = await this.lecturers.findOne({ where: { id } });
    if (!lecturer || lecturer.deletedAt) {
      throw new NotFoundException('Lecturer not found');
    }
    return lecturer;
  }

  private toView(lecturer: LecturerEntity): LecturerViewDto {
    return {
      id: lecturer.id,
      userId: lecturer.userId,
      employeeCode: lecturer.employeeCode,
      fullName: lecturer.fullName,
      department: lecturer.department,
      academicTitle: lecturer.academicTitle,
      email: lecturer.email,
      phone: lecturer.phone,
    };
  }
}
