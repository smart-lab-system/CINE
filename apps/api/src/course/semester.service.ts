import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import { formatDmy, semesterLabel } from '../common/semester-label';
import { CreateSemesterDto, UpdateSemesterDto } from './dto/semester.dto';
import { SemesterEntity } from './entities/semester.entity';
import { SemesterInput, semesterProblems } from './semester.rules';
import { SemesterView } from './course.types';

interface SemesterRow {
  id: string;
  academicYearStart: number;
  term: number;
  startDate: string;
  endDate: string;
  classCount: number;
}

/**
 * Học kỳ do admin quản lý (spec §2.1, §4). Giảng viên chỉ ĐỌC.
 *
 * Quy tắc, theo thứ tự "lỗi đầu vào (400) rồi xung đột với dữ liệu hiện có (409)":
 *   - luật hợp lệ ở `semesterProblems` (dùng chung với import);
 *   - không chồng ngày, không trùng (năm, kỳ);
 *   - không đổi (năm, kỳ) khi đã có lớp — nhãn trên phiên đã chụp nhãn cũ;
 *   - không xoá khi còn lớp.
 * Mọi quy tắc xung đột còn có ĐÚNG MỘT bản ở DB (ràng buộc/trigger) là thẩm quyền
 * cuối; kiểm ở đây chỉ để đưa ra câu báo lỗi đọc được thay cho "This request
 * conflicts with an existing record".
 */
@Injectable()
export class SemesterService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
  ) {}

  async list(withCounts: boolean): Promise<SemesterView[]> {
    const rows: SemesterRow[] = await this.dataSource.query(
      `SELECT s.id,
              s.academic_year_start AS "academicYearStart",
              s.term,
              to_char(s.start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(s.end_date,   'YYYY-MM-DD') AS "endDate",
              (SELECT count(*)::int FROM examcollect.class c WHERE c.semester_id = s.id) AS "classCount"
         FROM examcollect.semester s
        ORDER BY s.academic_year_start DESC, s.term DESC`,
    );
    return rows.map((row) => this.toView(row, withCounts));
  }

  async create(actorId: string, dto: CreateSemesterDto): Promise<SemesterView> {
    this.assertValid(dto);
    return this.dataSource.transaction(async (manager) => {
      await this.assertKeyFree(manager, dto.academicYearStart, dto.term, null);
      await this.assertNoOverlap(manager, dto.startDate, dto.endDate, null);

      const repo = manager.getRepository(SemesterEntity);
      const saved = await repo.save(
        repo.create({
          academicYearStart: dto.academicYearStart,
          term: dto.term,
          startDate: dto.startDate,
          endDate: dto.endDate,
        }),
      );
      const label = semesterLabel(saved.academicYearStart, saved.term);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'semester.create',
          targetType: 'semester',
          targetId: saved.id,
          newValue: {
            targetLabel: label,
            academicYearStart: saved.academicYearStart,
            term: saved.term,
            startDate: saved.startDate,
            endDate: saved.endDate,
          },
        },
        manager,
      );
      return this.toView({ ...saved, classCount: 0 }, true);
    });
  }

  async update(actorId: string, id: string, dto: UpdateSemesterDto): Promise<SemesterView> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SemesterEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy học kỳ.');

      const next: SemesterInput = {
        academicYearStart: dto.academicYearStart ?? current.academicYearStart,
        term: dto.term ?? current.term,
        startDate: dto.startDate ?? current.startDate,
        endDate: dto.endDate ?? current.endDate,
      };
      this.assertValid(next);

      const changed = (Object.keys(next) as (keyof SemesterInput)[]).filter(
        (key) => next[key] !== current[key],
      );
      const classCount = await this.countClasses(manager, id);
      if (changed.length === 0) {
        return this.toView({ ...current, classCount }, true);
      }

      const keyChanged = changed.includes('academicYearStart') || changed.includes('term');
      if (keyChanged) {
        if (classCount > 0) {
          throw new ConflictException(
            `Không đổi được năm học hay kỳ của ${semesterLabel(current.academicYearStart, current.term)} ` +
              `vì đã có ${classCount} lớp thuộc học kỳ này; chỉ sửa được ngày.`,
          );
        }
        await this.assertKeyFree(manager, next.academicYearStart, next.term, id);
      }
      if (changed.includes('startDate') || changed.includes('endDate')) {
        await this.assertNoOverlap(manager, next.startDate, next.endDate, id);
      }

      const before = { ...current };
      Object.assign(current, next);
      const saved = await repo.save(current);

      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      for (const key of changed) {
        oldValue[key] = before[key];
        newValue[key] = saved[key];
      }
      newValue.targetLabel = semesterLabel(saved.academicYearStart, saved.term);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'semester.update',
          targetType: 'semester',
          targetId: id,
          oldValue,
          newValue,
        },
        manager,
      );
      return this.toView({ ...saved, classCount }, true);
    });
  }

  async remove(actorId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SemesterEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy học kỳ.');

      const label = semesterLabel(current.academicYearStart, current.term);
      const classCount = await this.countClasses(manager, id);
      if (classCount > 0) {
        throw new ConflictException(
          `${label} còn ${classCount} lớp nên không xoá được. Hãy chuyển hoặc xoá các lớp đó trước.`,
        );
      }
      await repo.remove(current);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'semester.delete',
          targetType: 'semester',
          targetId: id,
          oldValue: {
            targetLabel: label,
            academicYearStart: current.academicYearStart,
            term: current.term,
            startDate: current.startDate,
            endDate: current.endDate,
          },
        },
        manager,
      );
    });
  }

  /** Nhãn `HK1 2026-2027` của một học kỳ, hoặc null nếu không có. Dùng để CHỤP `semester_name` lúc tạo phiên. */
  async labelOf(semesterId: string): Promise<string | null> {
    const [row] = await this.dataSource.query(
      `SELECT academic_year_start AS year, term FROM examcollect.semester WHERE id = $1`,
      [semesterId],
    );
    return row ? semesterLabel(row.year, row.term) : null;
  }

  private assertValid(input: SemesterInput): void {
    const problems = semesterProblems(input);
    if (problems.length > 0) throw new BadRequestException(problems.join(' '));
  }

  private async countClasses(manager: EntityManager, semesterId: string): Promise<number> {
    const [row] = await manager.query(
      `SELECT count(*)::int AS n FROM examcollect.class WHERE semester_id = $1`,
      [semesterId],
    );
    return row.n;
  }

  private async assertKeyFree(
    manager: EntityManager,
    year: number,
    term: number,
    excludeId: string | null,
  ): Promise<void> {
    const [row] = await manager.query(
      `SELECT 1 AS found FROM examcollect.semester
        WHERE academic_year_start = $1 AND term = $2 AND ($3::uuid IS NULL OR id <> $3)`,
      [year, term, excludeId],
    );
    if (row) throw new ConflictException(`${semesterLabel(year, term)} đã tồn tại.`);
  }

  private async assertNoOverlap(
    manager: EntityManager,
    startDate: string,
    endDate: string,
    excludeId: string | null,
  ): Promise<void> {
    const [row] = await manager.query(
      `SELECT academic_year_start AS year, term,
              to_char(start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(end_date,   'YYYY-MM-DD') AS "endDate"
         FROM examcollect.semester
        WHERE daterange(start_date, end_date, '[]') && daterange($1::date, $2::date, '[]')
          AND ($3::uuid IS NULL OR id <> $3)
        ORDER BY start_date LIMIT 1`,
      [startDate, endDate, excludeId],
    );
    if (row) {
      throw new ConflictException(
        `Khoảng ngày bị chồng với ${semesterLabel(row.year, row.term)} ` +
          `(${formatDmy(row.startDate)}–${formatDmy(row.endDate)}). Hai học kỳ không được chồng ngày.`,
      );
    }
  }

  private toView(
    row: Pick<SemesterRow, 'id' | 'academicYearStart' | 'term' | 'startDate' | 'endDate'> & {
      classCount?: number;
    },
    withCounts: boolean,
  ): SemesterView {
    return {
      id: row.id,
      academicYearStart: row.academicYearStart,
      term: row.term,
      label: semesterLabel(row.academicYearStart, row.term),
      startDate: row.startDate,
      endDate: row.endDate,
      ...(withCounts ? { classCount: row.classCount ?? 0 } : {}),
    };
  }
}
