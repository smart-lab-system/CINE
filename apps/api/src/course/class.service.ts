import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassEntity } from './entities/class.entity';
import { CreateClassDto, UpdateClassDto } from './dto/course.dto';
import { COURSE_NAME } from '../common/course-name';
import { TeachingClassView } from './course.types';

/**
 * Lớp, và quyền sở hữu của giảng viên trên chúng.
 *
 * Trước đợt thu hẹp master data, một lớp không có cột phạm vi của riêng nó:
 * nó thừa hưởng khoa qua `course_id`, nên mọi hàm ở đây bắt đầu bằng việc
 * chứng minh người gọi sở hữu MÔN. Tầng khoa đã bị cắt. Giờ `class.teacher_id`
 * là toàn bộ phạm vi của một giảng viên, và mọi kiểm tra là một phép so sánh
 * ở đúng một chỗ: `findOwnedByTeacher`.
 */
@Injectable()
export class ClassService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
  ) {}

  /**
   * Classes this lecturer teaches, shaped for the create-session form.
   *
   * One query with a GROUP BY, not a count per row — this list is fetched on
   * every visit to the form, and the capacity warning needs the number for
   * whichever class the lecturer picks, not just the first.
   *
   * A `studentCount` of 0 is meaningful rather than empty: it says nobody
   * has imported a roster for that class yet, which the form surfaces.
   *
   * Bộ lọc theo học kỳ biến mất cùng bảng `semester`: một lớp không mang
   * học kỳ nào nữa, chỉ phiên thi mới chụp `semester_name`.
   */
  async findForTeacher(teacherId: string): Promise<TeachingClassView[]> {
    const { entities, raw } = await this.classes
      .createQueryBuilder('k')
      .leftJoin('enrollment', 'e', 'e.home_class_id = k.id')
      .addSelect('COUNT(e.id)', 'studentCount')
      .where('k.teacherId = :teacherId', { teacherId })
      .groupBy('k.id')
      // Theo TÊN LỚP. Từng sắp theo môn trước, tên sau — nhưng môn là hằng
      // số nên khoá ấy không tách được gì, chỉ còn nói sai rằng danh sách
      // có nhóm theo môn.
      .orderBy('k.name', 'ASC')
      .getRawAndEntities<{ studentCount: string }>();

    return entities.map((klass, index) => ({
      id: klass.id,
      name: klass.name,
      courseName: klass.courseName,
      studentCount: parseInt(raw[index].studentCount, 10),
    }));
  }

  /**
   * The class, if this lecturer is the one who teaches it — 404 when it does
   * not exist, 403 when it is a colleague's.
   *
   * `class.teacher_id` is the whole of a lecturer's scope, so this is what
   * stands between them and creating an exam session for someone else's
   * class. Same 404-then-403 shape as ExamSessionService.findByIdForOwner,
   * for the same reason: a 403 on a class that does not exist would confirm
   * that some other lecturer's class has that id.
   */
  async findTaughtBy(id: string, teacherId: string): Promise<ClassEntity> {
    return this.findOwnedByTeacher(id, teacherId);
  }

  /**
   * Một lớp, giới hạn trong cùng MÔN với phiên thi.
   *
   * Thay `CourseService.findClassForCourse`, và giữ nguyên lý do nó tồn
   * tại: duyệt một yêu cầu xin phép không được gắn sinh viên vào lớp của
   * một môn khác, vì bài nộp của em sẽ được định tuyến về một giảng viên
   * chưa từng dạy em.
   *
   * Phép so giờ luôn đúng: `course_name` là hằng số ở mọi dòng. Giữ lại
   * như một lưới an toàn — nếu ràng buộc một môn có ngày được nới ra, đây
   * là chỗ chặn việc gắn sinh viên vào lớp của môn khác, và phía hỏng của
   * nó là TỪ CHỐI chứ không phải định tuyến nhầm.
   */
  async findByIdAndCourseName(id: string, courseName: string): Promise<ClassEntity | null> {
    return this.classes.findOne({ where: { id, courseName } });
  }

  /**
   * Lớp mới, luôn thuộc về chính người gọi.
   *
   * `dto` không mang `teacherId`: một giảng viên không gán lớp cho người
   * khác được. Trưởng khoa từng làm được điều đó, và cùng với vai trò ấy
   * thì khả năng này cũng biến mất.
   *
   * Môn KHÔNG đến từ `dto`. Hệ thống phục vụ đúng một môn, nên giá trị ấy
   * là hằng số — hỏi lại ở mỗi lần tạo lớp chỉ thêm một cơ hội gõ lệch, mà
   * gõ lệch ở đây không báo lỗi: nó lặng lẽ tách lớp này khỏi mọi phép tra
   * "cùng môn", và phép đầu tiên gãy là đường định tuyến bài thi bù.
   */
  async createForTeacher(teacherId: string, dto: CreateClassDto): Promise<ClassEntity> {
    return this.classes.save(
      this.classes.create({ ...dto, teacherId, courseName: COURSE_NAME }),
    );
  }

  /**
   * Sửa lớp của chính mình.
   *
   * CHO PHÉP CÓ CHỌN LỌC, không phải loại trừ. `Object.assign(klass, dto)`
   * trừ đi một trường sẽ để một trường MỚI thêm vào DTO sau này âm thầm lọt
   * qua — và nếu trường đó là `teacherId` phiên bản khác tên thì một giảng
   * viên đẩy được lớp của mình sang người khác rồi mất quyền.
   */
  async updateForTeacher(
    id: string,
    teacherId: string,
    dto: UpdateClassDto,
  ): Promise<ClassEntity> {
    const klass = await this.findOwnedByTeacher(id, teacherId);
    if (dto.name !== undefined) {
      klass.name = dto.name;
    }
    return this.classes.save(klass);
  }

  async removeForTeacher(id: string, teacherId: string): Promise<void> {
    const klass = await this.findOwnedByTeacher(id, teacherId);
    // `enrollment.home_class_id` là ON DELETE RESTRICT, nên lớp còn sinh
    // viên thì từ chối đi — một 409, không bao giờ là một roster mồ côi
    // trong im lặng.
    await this.classes.remove(klass);
  }

  /**
   * Vị từ quyền dùng chung cho mọi hàm ở đây — một chỗ để sửa, một chỗ để
   * test.
   *
   * 404 khi không tồn tại, 403 khi tồn tại nhưng của người khác. Bỏ sót chỗ
   * này là một giảng viên sửa được lớp của người khác.
   */
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
