import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ClassEntity } from './entities/class.entity';
import { CourseEntity } from './entities/course.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { ImportClassRowDto, ImportClassesDto } from './dto/import-classes.dto';
import { ImportClassResult, ImportClassRowError } from './course.types';

/**
 * Import hàng loạt `Class` từ Excel (CLAUDE.md §7.2.1), upsert `Course`
 * như tác dụng phụ.
 *
 * 50-150 lớp mỗi khoa mỗi kỳ không phải quy mô nhập tay. Trưởng khoa vẫn
 * là người bấm và vẫn chỉ chạm được vào môn của mình — không thêm quyền,
 * không thêm role, không đường vòng nào quanh `department_head_id`.
 *
 * File riêng chứ không nhét vào `ClassService`, theo đúng tiền lệ
 * `RosterService`: import hàng loạt là trách nhiệm khác với CRUD từng
 * bản ghi, và nó cần cách xử lý lỗi ngược hẳn (gom lỗi thay vì ném).
 */
@Injectable()
export class ClassImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * **Một dòng lỗi KHÔNG chặn cả batch** — ngược với
   * `RosterService.importForClass`, nơi một dòng lỗi chặn tất cả.
   *
   * Khác nhau có chủ đích, không phải thiếu nhất quán: roster là danh
   * sách MỘT lớp, nhập thiếu một dòng cho ra một sĩ số trông lành lặn mà
   * sai, và sai đó chỉ lộ ra vào hôm thi. Còn đây là danh sách lớp của CẢ
   * khoa: một môn gõ sai email giảng viên không được phép chặn 49 môn còn
   * lại nhập đúng. Lỗi được LIỆT KÊ ra cho người dùng sửa, không âm thầm
   * bỏ qua.
   *
   * Mỗi dòng là một transaction riêng: hỏng giữa chừng thì dòng đó không
   * để lại gì, còn các dòng trước đã commit vẫn giữ nguyên. Chạy tuần tự
   * chứ không song song, vì hai dòng cùng một mã môn phải thấy được môn
   * mà dòng trước vừa tạo — song song thì dòng thứ hai sẽ đâm vào
   * `uq_course_code_semester`.
   */
  async importForHead(
    headId: string,
    dto: ImportClassesDto,
  ): Promise<ImportClassResult> {
    const result: ImportClassResult = {
      coursesCreated: 0,
      classesCreated: 0,
      classesUpdated: 0,
      errors: [],
    };

    for (let index = 0; index < dto.rows.length; index++) {
      const error = await this.importRow(headId, dto.semesterId, dto.rows[index], result);
      if (error) {
        result.errors.push({ row: index, reason: error });
      }
    }

    return result;
  }

  /** Trả về thông báo lỗi nếu dòng này không nhập được, `null` nếu xong. */
  private async importRow(
    headId: string,
    semesterId: string,
    row: ImportClassRowDto,
    result: ImportClassResult,
  ): Promise<string | null> {
    // Giảng viên được kiểm TRƯỚC khi tạo môn, không phải sau. Ngược lại
    // thì một dòng sai email để lại đúng cái `Course` không lớp nào mà
    // /admin/unowned-courses tồn tại để dọn.
    const teacher = await this.accounts.findOne({
      where: { email: row.teacherEmail },
      select: { id: true, role: true, isActive: true },
    });
    if (!teacher) {
      return `Không tìm thấy tài khoản giảng viên với email ${row.teacherEmail}`;
    }
    if (teacher.role !== 'teacher') {
      // `class.teacher_id` trỏ vào một Trưởng khoa hay admin tạo ra lớp
      // không ai chạy được — cùng lý do `createForHead` từ chối.
      return `Tài khoản ${row.teacherEmail} không phải giảng viên`;
    }
    if (!teacher.isActive) {
      return `Tài khoản giảng viên ${row.teacherEmail} đã bị vô hiệu hoá`;
    }

    const existingCourse = await this.courses.findOne({
      where: { code: row.courseCode, semesterId },
    });
    if (existingCourse && existingCourse.departmentHeadId !== headId) {
      // Im lặng dùng lại sẽ cho khoa này tạo lớp dưới môn của khoa khác —
      // một lỗ hổng phạm vi, không phải một tiện ích.
      return `Môn ${row.courseCode} đã thuộc khoa khác trong học kỳ này`;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        let courseId = existingCourse?.id;
        if (!courseId) {
          const courseRepo = manager.getRepository(CourseEntity);
          const saved = await courseRepo.save(
            courseRepo.create({
              code: row.courseCode,
              name: row.courseName,
              semesterId,
              // Luôn là người bấm import, không bao giờ lấy từ file —
              // cùng lý do `CourseService.createForHead` không đọc
              // `departmentHeadId` từ body.
              departmentHeadId: headId,
            }),
          );
          courseId = saved.id;
          result.coursesCreated++;
        }

        const classRepo = manager.getRepository(ClassEntity);
        const existingClass = await classRepo.findOne({
          where: { courseId, name: row.className },
        });

        if (!existingClass) {
          await classRepo.save(
            classRepo.create({ courseId, name: row.className, teacherId: teacher.id }),
          );
          result.classesCreated++;
          return;
        }

        // Import lại cùng một file là chuyện thường (sửa một dòng rồi gửi
        // lại cả file), nên đây phải là no-op chứ không phải nhân đôi lớp.
        if (existingClass.teacherId !== teacher.id) {
          await classRepo.update(existingClass.id, { teacherId: teacher.id });
          // `enrollment.home_teacher_id` được copy sang mọi bài nộp của
          // sinh viên, nên một lớp đổi giảng viên mà roster vẫn trỏ vào
          // người cũ sẽ định tuyến bài về người không còn dạy nó — và
          // không có gì trên bài nộp trông sai cả. Đúng cùng một xử lý
          // `ClassService.updateForHead` làm; đường import không được
          // phép là một đường vòng quanh nó.
          await manager.update(
            EnrollmentEntity,
            { homeClassId: existingClass.id },
            { homeTeacherId: teacher.id },
          );
        }
        result.classesUpdated++;
      });
    } catch (error) {
      return error instanceof Error ? error.message : 'Lỗi không xác định';
    }

    return null;
  }
}

export type { ImportClassResult, ImportClassRowError };
