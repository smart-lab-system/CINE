import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Một giảng viên không coi được hai phiên cùng lúc — và cần thời gian đi lại.
 *
 * Trước migration này, `exam_session` có đúng hai ràng buộc chống trùng:
 * `ex_exam_session_room_overlap` (theo `room_name`) và
 * `ex_exam_session_class_overlap` (theo `class_id`). **Không có cái nào theo
 * `teacher_id`.** Nên hai lớp khác nhau + hai phòng khác nhau + cùng khung giờ
 * + cùng một giảng viên đi qua cả hai ràng buộc, và hệ thống nhận một lịch mà
 * không người nào coi được. Đây là lỗ hổng, không phải hành vi có chủ ý.
 *
 * Luật chốt 2026-09-21: khoảng cách giữa `end_time` của phiên này và
 * `start_time` của phiên kia phải **>= 30 phút**.
 *
 * ## Vì sao phải có hàm bọc, không viết thẳng `end_time + interval '30 minutes'`
 *
 * `timestamptz + interval` là **STABLE**, không IMMUTABLE (`pg_proc.provolatile
 * = 's'` cho `timestamptz_pl_interval`), nên Postgres từ chối nó trong biểu
 * thức index: *"functions in index expression must be marked IMMUTABLE"*. Đã
 * kiểm chứng trên chính image Postgres của `docker-compose.yml`, không phải suy
 * đoán.
 *
 * Dấu STABLE ấy là để phòng xa cho interval có thành phần NGÀY/THÁNG, vốn phụ
 * thuộc TimeZone qua DST. Cộng đúng 30 PHÚT thì không dính chuyện đó — nó là
 * cộng 1800 giây thời gian tuyệt đối. Nên bọc lại và khai IMMUTABLE là đúng về
 * ngữ nghĩa, không phải nói dối trình tối ưu.
 *
 * ## Vì sao chỉ nới MỘT đầu
 *
 * Nới `end_time` thêm 30 phút cho MỌI dòng là đủ để bắt cả hai chiều, vì phép
 * `&&` đối xứng: phiên nào đứng trước thì phần đuôi đã nới của nó chạm vào
 * `start_time` của phiên sau. Nới cả hai đầu sẽ đòi cách nhau 60 phút — sai.
 *
 * Kiểm chứng đã chạy: cách đúng 30 phút CHO QUA; cách 20 phút và 15 phút bị
 * CHẶN ở cả hai chiều; trùng giờ bị CHẶN; giảng viên khác trùng giờ CHO QUA.
 *
 * ## Vì sao vị từ trạng thái GIỐNG HỆT hai ràng buộc kia
 *
 * Bản nháp đầu của migration này loại ít hơn — giữ `collecting` là trạng thái
 * còn chiếm chỗ, với lý lẽ "giảng viên đang đứng thu bài". **Sai**, và e2e
 * `exam-schedule-conflict` chỉ ra ngay: `finalize` là hành động giảng viên chủ
 * động tuyên bố ca thi đã xong, và thu bài từ đó trở đi là việc của agent, tự
 * động, tới hết `SUBMISSION_GRACE_PERIOD_MS`. Cả tiền đề của hệ thống này là
 * không ai phải canh lúc thu — nên `collecting` KHÔNG giữ chân giảng viên.
 *
 * Giữ cùng một vị từ cho cả ba ràng buộc còn có giá trị riêng: người đọc chỉ
 * phải nhớ một luật "trạng thái nào thôi chiếm chỗ", thay vì hai.
 */
export class TeacherScheduleGap1789350000000 implements MigrationInterface {
  name = 'TeacherScheduleGap1789350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "examcollect"."teacher_busy_range"(
        s timestamptz, e timestamptz
      ) RETURNS tstzrange
      LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
      AS $fn$ SELECT tstzrange(s, e + make_interval(mins => 30), '[)') $fn$
    `);

    // DỪNG thay vì tự dời lịch của ai. Cùng tiền lệ với
    // `1789320000000-ExpandMasterDataToText`, nơi gặp `class_id IS NULL` thì
    // nổ và bắt sửa tay: một lịch thi là thoả thuận với người thật, và đoán hộ
    // họ giờ mới là bịa ra một sự thật.
    await queryRunner.query(`
      DO $$
      DECLARE n int; sample text;
      BEGIN
        SELECT count(*), string_agg(x.txt, E'\n' ORDER BY x.txt)
          INTO n, sample
        FROM (
          SELECT DISTINCT format('  - "%s" (%s) và "%s" (%s)',
                   a.name, a.start_time, b.name, b.start_time) AS txt
          FROM "examcollect"."exam_session" a
          JOIN "examcollect"."exam_session" b
            ON b.teacher_id = a.teacher_id
           AND b.id > a.id
           AND a.status NOT IN ('collecting','completed','cancelled')
           AND b.status NOT IN ('collecting','completed','cancelled')
           AND "examcollect"."teacher_busy_range"(a.start_time, a.end_time)
            && "examcollect"."teacher_busy_range"(b.start_time, b.end_time)
          LIMIT 20
        ) x;

        IF n > 0 THEN
          RAISE EXCEPTION
            'Có % cặp phiên thi của cùng một giảng viên cách nhau dưới 30 phút. Dời lịch hoặc huỷ bớt rồi chạy lại migration này — KHÔNG đoán hộ.%s',
            n, E'\n' || sample;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD CONSTRAINT "ex_exam_session_teacher_gap"
        EXCLUDE USING gist (
          "teacher_id" WITH =,
          "examcollect"."teacher_busy_range"("start_time", "end_time") WITH &&
        )
        WHERE (
          status <> 'collecting'
          AND status <> 'completed'
          AND status <> 'cancelled'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT IF EXISTS "ex_exam_session_teacher_gap"`,
    );
    // Sau ràng buộc, không trước: ràng buộc phụ thuộc hàm này.
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "examcollect"."teacher_busy_range"(timestamptz, timestamptz)`,
    );
  }
}
