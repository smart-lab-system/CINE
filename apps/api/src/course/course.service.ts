import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseEntity } from './entities/course.entity';
import { ClassEntity } from './entities/class.entity';
import { CourseView } from './course.types';

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
  ) {}

  /**
   * One class, scoped to its course. The scoping is the point: approving an
   * access request must not be able to attach a student to a class from a
   * different course, which would route their submission to a teacher who
   * never taught them.
   */
  async findClassForCourse(courseId: string, classId: string): Promise<ClassEntity | null> {
    return this.classes.findOne({ where: { id: classId, courseId } });
  }

  /**
   * One query (LEFT JOIN + GROUP BY), not one COUNT per course — avoids
   * the N+1 the create-exam-session form's capacity warning would
   * otherwise cost.
   */
  async findAll(): Promise<CourseView[]> {
    const { entities, raw } = await this.courses
      .createQueryBuilder('c')
      .leftJoin('enrollment', 'e', 'e.course_id = c.id')
      .addSelect('COUNT(e.id)', 'enrollmentCount')
      .groupBy('c.id')
      .orderBy('c.code', 'ASC')
      .getRawAndEntities<{ enrollmentCount: string }>();

    return entities.map((course, index) => ({
      id: course.id,
      code: course.code,
      name: course.name,
      semesterId: course.semesterId,
      enrollmentCount: parseInt(raw[index].enrollmentCount, 10),
    }));
  }
}
