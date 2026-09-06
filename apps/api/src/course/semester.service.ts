import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { SemesterEntity } from './entities/semester.entity';
import { CreateSemesterDto, UpdateSemesterDto } from './dto/course.dto';
import { AuditLogService } from '../admin/audit-log.service';

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
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Gạt cờ hiện hành sang một kỳ khác.
   *
   * Một transaction, và gỡ cờ kỳ cũ TRƯỚC rồi mới gắn kỳ mới — làm ngược thứ
   * tự sẽ có hai dòng is_current cùng lúc và đụng uq_semester_single_current.
   *
   * Audit ghi trong CÙNG transaction: đổi kỳ hiện hành đổi thứ mọi giảng viên
   * trong trường nhìn thấy, nên một dòng audit nói về việc đã rollback còn tệ
   * hơn không có dòng nào.
   */
  async setCurrent(id: string, actorId: string): Promise<SemesterEntity> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(SemesterEntity);
        const target = await repo.findOne({ where: { id } });
        if (!target) {
          throw new NotFoundException('Semester not found');
        }
        if (target.isCurrent) {
          // Bấm hai lần không phải lỗi, và không có gì để ghi audit.
          return target;
        }

        const previous = await repo.findOne({ where: { isCurrent: true } });
        if (previous) {
          await repo.update(previous.id, { isCurrent: false });
        }
        await repo.update(id, { isCurrent: true });

        await this.auditLog.recordUserAction(
          {
            actorId,
            action: 'semester.current_changed',
            targetType: 'semester',
            targetId: id,
            oldValue: previous ? { id: previous.id, name: previous.name } : {},
            newValue: { id: target.id, name: target.name },
          },
          manager,
        );

        return { ...target, isCurrent: true };
      });
    } catch (error) {
      // PostgresExceptionFilter đã đổi 23505 thành 409, nhưng với câu chung
      // "This request conflicts with an existing record." — vô nghĩa với người
      // vừa bấm chuyển học kỳ. Bắt riêng để nói đúng chuyện.
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          'Một yêu cầu khác vừa đổi kỳ hiện hành. Tải lại rồi thử lại.',
        );
      }
      throw error;
    }
  }

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
    // Cờ hiện hành phải chuyển đi trước. Xoá nó làm cả hệ thống mù: mọi màn
    // hình lọc theo học kỳ mất mặc định, và không có gì nói vì sao.
    if (semester.isCurrent) {
      throw new ConflictException(
        'Không xoá được học kỳ đang hiện hành. Chuyển cờ sang kỳ khác trước.',
      );
    }
    // course.semester_id is ON DELETE RESTRICT, so a term still holding
    // courses refuses to go — a 409, not a cascade that would take the
    // courses with it.
    await this.semesters.remove(semester);
  }
}
