import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ExamSessionModule } from './exam-session/exam-session.module';
import { CourseModule } from './course/course.module';
import { RoomModule } from './room/room.module';
import { dataSourceOptions } from './database/data-source';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),
    HealthModule,
    AuthModule,
    AccountsModule,
    ExamSessionModule,
    CourseModule,
    RoomModule,
  ],
})
export class AppModule {}
