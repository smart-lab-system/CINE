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
