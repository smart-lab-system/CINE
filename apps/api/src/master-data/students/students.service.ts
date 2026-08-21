import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { StudentEntity } from './student.entity';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { SearchStudentsDto } from './dto/search-students.dto';
import { PaginatedStudentsDto, StudentListItemDto } from './dto/student-list-item.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateStudentDto): Promise<{ id: string }> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StudentEntity);
      return repo.save(
        repo.create({
          studentCode: dto.studentCode,
          fullName: dto.fullName,
          dateOfBirth: dto.dateOfBirth ?? null,
          classCode: dto.classCode ?? null,
          cohortYear: dto.cohortYear ?? null,
        }),
      );
    });
    return { id: saved.id };
  }

  async search(query: SearchStudentsDto): Promise<PaginatedStudentsDto> {
    const qb = this.students.createQueryBuilder('s').where('s.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(s.student_code ILIKE :term OR s.full_name ILIKE :term OR s.class_code ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    qb.orderBy('s.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((s) => this.toView(s)), total };
  }

  async update(id: string, dto: UpdateStudentDto): Promise<StudentListItemDto> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StudentEntity);
      const student = await this.findActiveOrThrow(repo, id);
      await repo.update(id, {
        fullName: dto.fullName ?? student.fullName,
        dateOfBirth: dto.dateOfBirth ?? student.dateOfBirth,
        classCode: dto.classCode ?? student.classCode,
        cohortYear: dto.cohortYear ?? student.cohortYear,
      });
    });
    return this.toView(await this.findActiveOrThrow(this.students, id));
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StudentEntity);
      await this.findActiveOrThrow(repo, id);
      await repo.update(id, { deletedAt: new Date() });
    });
  }

  /** Reused by the Excel import worker (Task 7) for its per-row
   * upsert-by-studentCode logic. `studentCode` is CITEXT in the DB, so this
   * match is already case-insensitive with no extra handling needed. */
  async upsertByCode(dto: CreateStudentDto): Promise<{ id: string; created: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StudentEntity);
      const existing = await repo.findOne({
        where: { studentCode: dto.studentCode, deletedAt: IsNull() },
      });

      if (existing) {
        await repo.update(existing.id, {
          fullName: dto.fullName,
          dateOfBirth: dto.dateOfBirth ?? existing.dateOfBirth,
          classCode: dto.classCode ?? existing.classCode,
          cohortYear: dto.cohortYear ?? existing.cohortYear,
        });
        return { id: existing.id, created: false };
      }

      const saved = await repo.save(
        repo.create({
          studentCode: dto.studentCode,
          fullName: dto.fullName,
          dateOfBirth: dto.dateOfBirth ?? null,
          classCode: dto.classCode ?? null,
          cohortYear: dto.cohortYear ?? null,
        }),
      );
      return { id: saved.id, created: true };
    });
  }

  private async findActiveOrThrow(
    repo: Repository<StudentEntity>,
    id: string,
  ): Promise<StudentEntity> {
    const student = await repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  private toView(student: StudentEntity): StudentListItemDto {
    return {
      id: student.id,
      studentCode: student.studentCode,
      fullName: student.fullName,
      dateOfBirth: student.dateOfBirth,
      classCode: student.classCode,
      cohortYear: student.cohortYear,
    };
  }
}
