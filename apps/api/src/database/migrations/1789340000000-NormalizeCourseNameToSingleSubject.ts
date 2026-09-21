import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kéo toàn bộ `course_name` cũ về MỘT chuỗi, sau khi "một môn duy nhất" được
 * chốt là ràng buộc của hệ thống chứ không phải phạm vi của bản demo.
 *
 * VÌ SAO BẮT BUỘC, không phải dọn cho đẹp: từ đây biểu mẫu tạo lớp không hỏi
 * tên môn nữa, lớp mới luôn nhận hằng số `COURSE_NAME`. Nếu dữ liệu cũ giữ
 * tên cũ thì hệ thống tách làm hai nửa không thấy nhau, và chỗ đau nhất là
 * `SessionRosterService.addManually`: nó tìm lớp GỐC của sinh viên thi bù
 * bằng `class.course_name = exam_session.course_name`. Một em thuộc lớp cũ
 * sang thi bù ở phiên của lớp mới sẽ không khớp lớp nào, nên bài của em bị
 * gán về lớp của PHIÊN — tức là rơi vào tay giảng viên không dạy em. Hỏng
 * trong im lặng, đúng thứ mà cả đợt cắt master data dồn sức chống.
 *
 * Chuỗi được VIẾT THẲNG ở đây chứ không import từ `common/course-name.ts`.
 * Một migration phải bất biến: nếu nó đọc hằng số của ứng dụng thì lần sửa
 * hằng số sau này sẽ đổi ngược nghĩa của một migration đã chạy. Đổi tên môn
 * về sau cần một migration RIÊNG, lấy file này làm mẫu.
 */
export class NormalizeCourseNameToSingleSubject1789340000000 implements MigrationInterface {
  name = 'NormalizeCourseNameToSingleSubject1789340000000';

  /** Phải khớp `COURSE_NAME` ở `src/common/course-name.ts` tại thời điểm viết. */
  private static readonly COURSE_NAME = 'CTDL&GT';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const courseName = NormalizeCourseNameToSingleSubject1789340000000.COURSE_NAME;

    // CHẶN TRƯỚC KHI GHI. Khoá duy nhất của lớp là
    // `(teacher_id, course_name, name)`, nên hôm nay một giảng viên ĐƯỢC
    // PHÉP có hai lớp trùng tên ở hai môn khác nhau. Gộp môn lại là biến
    // chúng thành hai dòng trùng khoá, và Postgres sẽ từ chối giữa chừng.
    //
    // Không tự đổi tên để né: hai lớp cùng (giảng viên, tên) sau khi gộp là
    // hai thứ người dùng không phân biệt nổi, và quyết định giữ cái nào,
    // đổi tên cái nào là của con người — không phải của một câu UPDATE chạy
    // lúc nửa đêm.
    const clashes: Array<{ teacher_id: string; name: string; cac_mon: string }> =
      await queryRunner.query(`
        SELECT teacher_id, name, string_agg(DISTINCT course_name, ' | ') AS cac_mon
        FROM examcollect.class
        GROUP BY teacher_id, name
        HAVING count(*) > 1
        ORDER BY teacher_id, name
      `);

    if (clashes.length > 0) {
      const preview = clashes
        .slice(0, 20)
        .map((row) => `  - GV ${row.teacher_id} · lớp "${row.name}" · môn: ${row.cac_mon}`)
        .join('\n');
      const more = clashes.length > 20 ? `\n  ... và ${clashes.length - 20} nhóm nữa` : '';
      throw new Error(
        `Không gộp được tên môn: ${clashes.length} nhóm lớp sẽ trùng khoá ` +
          `(teacher_id, name) sau khi gộp.\n${preview}${more}\n\n` +
          `Mỗi nhóm cần một quyết định của con người — đổi tên hoặc xoá bớt ` +
          `một lớp — rồi chạy lại migration này.`,
      );
    }

    // Hai bảng phải đồng ý với nhau, nếu không thì phép tra lớp gốc ở trên
    // hỏng đúng theo kiểu migration này sinh ra để chặn. `data-source.ts`
    // đặt `migrationsTransactionMode: 'none'`, nên giao dịch phải tự mở.
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `UPDATE examcollect."class" SET "course_name" = $1 WHERE "course_name" <> $1`,
        [courseName],
      );
      await queryRunner.query(
        `UPDATE examcollect."exam_session" SET "course_name" = $1 WHERE "course_name" <> $1`,
        [courseName],
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Không quay lại được. Tên môn cũ của từng lớp không suy ra được từ bất kỳ
   * cột nào còn lại — chúng đã bị ghi đè. Khôi phục từ bản sao lưu chụp
   * trước khi chạy.
   */
  public async down(): Promise<void> {
    throw new Error(
      'NormalizeCourseNameToSingleSubject không có đường lùi: tên môn cũ đã bị ' +
        'ghi đè và không cột nào suy lại được. Khôi phục từ bản sao lưu chụp ' +
        'trước khi chạy migration này.',
    );
  }
}
