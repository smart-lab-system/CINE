import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassEntity } from './entities/class.entity';
import { formatNominalClassLabel } from './nominal-class-label';
import { TeachingClassView } from './course.types';

/**
 * Phạm vi giảng viên trên lớp đã được admin phân công.
 *
 * `class.teacher_id` là toàn bộ scope: NULL = chưa gán → không hiện ở
 * `/classes/teaching`. Tạo lớp thuộc `AdminCourseSectionService`.
 */
@Injectable()
export class ClassService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
  ) {}

  async findForTeacher(teacherId: string): Promise<TeachingClassView[]> {
    const { entities, raw } = await this.classes
      .createQueryBuilder('k')
      .leftJoin('k.semester', 's')
      .leftJoin('k.nominalClass', 'nc')
      .leftJoin('enrollment', 'e', 'e.home_class_id = k.id')
      .addSelect('COUNT(e.id)', 'studentCount')
      .addSelect('s.name', 'semesterName')
      .addSelect('nc.code', 'nominalClassCode')
      .addSelect('nc.name', 'nominalClassDisplayName')
      .where('k.teacherId = :teacherId', { teacherId })
      .groupBy('k.id')
      .addGroupBy('s.id')
      .addGroupBy('nc.id')
      .orderBy('k.name', 'ASC')
      .getRawAndEntities<{
        studentCount: string;
        semesterName: string | null;
        nominalClassCode: string | null;
        nominalClassDisplayName: string | null;
      }>();

    return entities.map((klass, index) => ({
      id: klass.id,
      name: klass.name,
      courseName: klass.courseName,
      semesterId: klass.semesterId,
      semesterName: raw[index].semesterName ?? null,
      nominalClassId: klass.nominalClassId,
      nominalClassName: formatNominalClassLabel(
        raw[index].nominalClassCode,
        raw[index].nominalClassDisplayName,
      ),
      studentCount: parseInt(raw[index].studentCount, 10),
    }));
  }

  async findTaughtBy(id: string, teacherId: string): Promise<ClassEntity> {
    return this.findOwnedByTeacher(id, teacherId);
  }

  async findByIdAndCourseName(id: string, courseName: string): Promise<ClassEntity | null> {
    return this.classes.findOne({ where: { id, courseName } });
  }

  async findOwnedByTeacher(id: string, teacherId: string): Promise<ClassEntity> {
    const klass = await this.classes.findOne({ where: { id } });
    if (!klass) {
      throw new NotFoundException('Class not found');
    }
    if (klass.teacherId !== teacherId) {
      throw new ForbiddenException('You do not teach this class');
    }
    return klass;
  }
}
