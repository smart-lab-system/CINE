import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
