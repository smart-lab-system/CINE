import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ExamSessionModule } from './exam-session/exam-session.module';
import { SubmissionModule } from './submission/submission.module';
import { GradingModule } from './grading/grading.module';
import { CourseModule } from './course/course.module';
import { RoomModule } from './room/room.module';
import { dataSourceOptions } from './database/data-source';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),
    /**
     * Redis cho hàng đợi chấm điểm. CLAUDE.md: Redis dùng cho trạng thái
     * sống và hàng đợi, KHÔNG dùng làm nơi lưu dữ liệu bền — nên không
     * có sự thật nào chỉ tồn tại ở đây. Tiến độ chấm đọc từ
     * `grading_result` trong Postgres, chính vì lý do đó.
     *
     * `getOrThrow` cho host/port: cấu hình thiếu phải nổ lúc khởi động,
     * không phải lúc giảng viên bấm chấm và nhận 500. Mật khẩu và db thì
     * optional — dev không cần, nhưng có đường cấu hình sẵn nên chuyển
     * sang Redis có auth không phải sửa code.
     */
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: Number(config.getOrThrow<string>('REDIS_PORT')),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          db: Number(config.get<string>('REDIS_DB') ?? 0),
        },
        /**
         * Không gian khoá RIÊNG cho test. `'bull'` là mặc định của BullMQ,
         * nên ngoài test không có gì đổi.
         *
         * Vì sao cần (2026-09-15, mất một buổi để tìm ra): một hàng đợi
         * BullMQ là tài nguyên TOÀN CỤC theo Redis, không thuộc về tiến
         * trình nào. `pnpm --filter api dev` đang chạy trong một terminal
         * khác cũng đăng ký một worker trên đúng hàng đợi `grading` ấy, và
         * nó GIÀNH job của bộ e2e — rồi chấm bằng provider của CHÍNH NÓ,
         * chạy từ `dist/` cũ, với `NODE_ENV` không phải `test`.
         *
         * Triệu chứng hôm đó: 5 test đỏ với `modelUsed: null`, và
         * `failedReason` trong Redis là một lỗi HTTP 400 của Anthropic —
         * trong khi provider mà chính tiến trình test bind vào là
         * `keyword-match@1`, đã kiểm bằng probe. Hai sự thật mâu thuẫn cho
         * tới khi đọc `stacktrace` của job và thấy đường dẫn `dist\src\`.
         *
         * Guard `NODE_ENV === 'test'` ở `grading.module.ts` chặn tiến trình
         * TEST gọi API tính tiền. Prefix này chặn tiến trình KHÁC nhìn thấy
         * job của test — cần cả hai, vì cái thứ nhất không với tới được một
         * tiến trình mà bộ test không điều khiển.
         */
        prefix: process.env.NODE_ENV === 'test' ? 'bull-test' : 'bull',
      }),
    }),
    // Powers ExamSessionScheduler (the finalize sweep). Registered once,
    // app-wide, as @nestjs/schedule requires. Its intervals are cleared
    // on module destroy, so `app.close()` in the e2e specs leaves no
    // timer behind.
    ScheduleModule.forRoot(),
    HealthModule,
    AuthModule,
    AccountsModule,
    ExamSessionModule,
    SubmissionModule,
    GradingModule,
    CourseModule,
    RoomModule,
  ],
})
export class AppModule {}
