import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClassEntity } from './entities/class.entity';
import { CourseEntity } from './entities/course.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import { CreateClassDto, UpdateClassDto } from './dto/course.dto';

/**
 * A class has no scope column of its own: it inherits the department through
 * `course_id`. Every method here therefore starts by proving the caller owns
 * the course, which is the single place that decision is made.
 */
@Injectable()
export class ClassService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /** Every class under every course this head owns. */
  async findForHead(headId: string): Promise<ClassEntity[]> {
    const owned = await this.courses.find({
      where: { departmentHeadId: headId },
      select: { id: true },
    });
    if (owned.length === 0) {
      return [];
    }
    // One query with an IN, not one per course.
    return this.classes.find({
      where: { courseId: In(owned.map((c) => c.id)) },
      order: { name: 'ASC' },
    });
  }

  /** Classes this lecturer teaches — the scope that already existed. */
  async findForTeacher(teacherId: string): Promise<ClassEntity[]> {
    return this.classes.find({ where: { teacherId }, order: { name: 'ASC' } });
  }

  async createForHead(headId: string, dto: CreateClassDto): Promise<ClassEntity> {
    await this.assertOwnsCourse(dto.courseId, headId);
    await this.assertIsTeacher(dto.teacherId);
    return this.classes.save(this.classes.create(dto));
  }

  async updateForHead(
    id: string,
    headId: string,
    dto: UpdateClassDto,
  ): Promise<ClassEntity> {
    const klass = await this.findOwnedBy(id, headId);
    if (dto.teacherId) {
      await this.assertIsTeacher(dto.teacherId);
    }
    Object.assign(klass, dto);
    return this.classes.save(klass);
  }

  async removeForHead(id: string, headId: string): Promise<void> {
    const klass = await this.findOwnedBy(id, headId);
    // enrollment.home_class_id is ON DELETE RESTRICT, so a class that still
    // has students refuses to go — a 409, never a silent orphaning of the
    // roster.
    await this.classes.remove(klass);
  }

  private async findOwnedBy(id: string, headId: string): Promise<ClassEntity> {
    const klass = await this.classes.findOne({ where: { id } });
    if (!klass) {
      throw new NotFoundException('Class not found');
    }
    await this.assertOwnsCourse(klass.courseId, headId);
    return klass;
  }

  private async assertOwnsCourse(courseId: string, headId: string): Promise<void> {
    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.departmentHeadId !== headId) {
      throw new ForbiddenException('You do not own this course');
    }
  }

  private async assertIsTeacher(accountId: string): Promise<void> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) {
      throw new BadRequestException('Lecturer account not found');
    }
    if (account.role !== 'teacher') {
      throw new BadRequestException('A class must be assigned to a teacher account');
    }
  }
}
