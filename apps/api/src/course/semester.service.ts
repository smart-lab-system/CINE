import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SemesterEntity } from './entities/semester.entity';
import { CreateSemesterDto, UpdateSemesterDto } from './dto/course.dto';

/**
 * Terms are university-wide: every Trưởng khoa reads and writes the same
 * list, and none of them owns it. Scoping a term to a department would mean
 * each one creating its own "Học kỳ 1 2026-2027", which is the same real
 * term wearing different ids.
 *
 * The shared namespace is what makes `uq_semester_name` necessary; the
 * duplicate-name collision surfaces as a 409 through
 * PostgresExceptionFilter, not as an internal error.
 */
@Injectable()
export class SemesterService {
  constructor(
    @InjectRepository(SemesterEntity)
    private readonly semesters: Repository<SemesterEntity>,
  ) {}

  async findAll(): Promise<SemesterEntity[]> {
    return this.semesters.find({ order: { startDate: 'DESC' } });
  }

  async create(dto: CreateSemesterDto): Promise<SemesterEntity> {
    return this.semesters.save(this.semesters.create(dto));
  }

  async update(id: string, dto: UpdateSemesterDto): Promise<SemesterEntity> {
    const semester = await this.semesters.findOne({ where: { id } });
    if (!semester) {
      throw new NotFoundException('Semester not found');
    }
    Object.assign(semester, dto);
    return this.semesters.save(semester);
  }

  async remove(id: string): Promise<void> {
    const semester = await this.semesters.findOne({ where: { id } });
    if (!semester) {
      throw new NotFoundException('Semester not found');
    }
    // course.semester_id is ON DELETE RESTRICT, so a term still holding
    // courses refuses to go — a 409, not a cascade that would take the
    // courses with it.
    await this.semesters.remove(semester);
  }
}
