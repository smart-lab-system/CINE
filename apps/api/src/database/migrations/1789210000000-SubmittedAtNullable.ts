import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `submission.submitted_at` được phép NULL, và dòng chưa nộp thì NULL
 * thật.
 *
 * Từ khi §7.1.2 gieo một dòng cho mỗi (sinh viên × file bắt buộc), cột
 * này mang một giá trị KHÔNG CÓ NGHĨA trên mọi dòng `not_submitted` và
 * `absent`: nó nhận `now()` mặc định, tức "lúc giảng viên bấm Mở phiên".
 * Không ai nộp gì vào lúc đó. Trước đó cột luôn đúng vì dòng chỉ tồn tại
 * khi có file bay về.
 *
 * Vì sao không để nguyên và ghi nghĩa vào comment (cách đã chọn lúc đầu):
 * mọi câu hỏi lọc theo `submitted_at` sẽ tính cả dòng chưa nộp, và
 * người viết câu ấy không có lý do gì để nghi ngờ một cột NOT NULL.
 * Câu cảnh báo "nộp sau khi xác nhận kết thúc" (§7.3) hiện KHÔNG lọt
 * chỉ vì dòng gieo có `submitted_at` = lúc mở phiên, luôn sớm hơn lúc
 * xác nhận — đó là may, không phải thiết kế. Một báo cáo "giờ nộp sớm
 * nhất của lớp" thì đã sai ngay hôm nay.
 *
 * GIỮ `DEFAULT now()`. Bỏ nó sẽ đúng hơn về mặt nguyên tắc — buộc mọi
 * đường ghi phải nói rõ — nhưng nó đổi hành vi của mọi INSERT không nêu
 * cột này, gồm cả các đường chưa rà hết. `seedSeats` truyền NULL tường
 * minh; đó là chỗ duy nhất cần nó.
 *
 * `down()` phải điền lại trước khi bật NOT NULL, nếu không nó nổ trên
 * chính dữ liệu mà `up()` vừa tạo ra. Điền `created_at` chứ không phải
 * `now()`: nó ít sai hơn, và quan trọng hơn là nó KHÔNG ĐỔI theo thời
 * điểm chạy rollback.
 */
export class SubmittedAtNullable1789210000000 implements MigrationInterface {
  name = 'SubmittedAtNullable1789210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."submission" ALTER COLUMN "submitted_at" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "examcollect"."submission"
          SET "submitted_at" = NULL
        WHERE "status" IN ('not_submitted', 'absent')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "examcollect"."submission"
          SET "submitted_at" = "created_at"
        WHERE "submitted_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."submission" ALTER COLUMN "submitted_at" SET NOT NULL`,
    );
  }
}
