import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../identity/entities/user.entity';
import { StudentEntity } from '../entities/student.entity';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { SearchStudentsDto } from './dto/search-students.dto';
import { StudentViewDto } from './dto/student-response.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async create(dto: CreateStudentDto): Promise<{ id: string }> {
    if (dto.userId) {
      await this.assertActiveUser(dto.userId);
    }
    const student = await this.students.save(
      this.students.create({
        studentCode: dto.studentCode,
        fullName: dto.fullName,
        userId: dto.userId ?? null,
        status: dto.status ?? 'active',
      }),
    );
    return { id: student.id };
  }

  async search(
    query: SearchStudentsDto,
  ): Promise<{ items: StudentViewDto[]; total: number }> {
    const qb = this.students
      .createQueryBuilder('s')
      .where('s.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(s.student_code ILIKE :term OR s.full_name ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }
    if (query.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }

    qb.orderBy('s.student_code', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((s) => this.toView(s)), total };
  }

  async findOne(id: string): Promise<StudentViewDto> {
    return this.toView(await this.findActiveOrThrow(id));
  }

  async update(id: string, dto: UpdateStudentDto): Promise<StudentViewDto> {
    const student = await this.findActiveOrThrow(id);
    if (dto.userId) {
      await this.assertActiveUser(dto.userId);
    }

    await this.students.update(id, {
      fullName: dto.fullName ?? student.fullName,
      userId: dto.userId === undefined ? student.userId : dto.userId,
      status: dto.status ?? student.status,
    });
    return this.toView(await this.findActiveOrThrow(id));
  }

  async remove(id: string): Promise<void> {
    await this.findActiveOrThrow(id);
    await this.students.update(id, { deletedAt: new Date() });
  }

  private async assertActiveUser(userId: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Linked user not found');
    }
  }

  private async findActiveOrThrow(id: string): Promise<StudentEntity> {
    const student = await this.students.findOne({ where: { id } });
    if (!student || student.deletedAt) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  private toView(student: StudentEntity): StudentViewDto {
    return {
      id: student.id,
      userId: student.userId,
      studentCode: student.studentCode,
      fullName: student.fullName,
      status: student.status,
    };
  }
}
