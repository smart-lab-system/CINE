import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseModule } from '../course/course.module';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { RequiredDeliverableEntity } from './entities/required-deliverable.entity';
import { ExamSessionService } from './exam-session.service';
import { ExamSessionController } from './exam-session.controller';
import { ExamSessionGateway } from './exam-session.gateway';
import { ExamSessionEvents } from './exam-session.events';
import { ExamSessionScheduler } from './exam-session.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamSessionEntity, RequiredDeliverableEntity]),
    // Registered the same way AuthModule does (JwtModule.register({}) with
    // no default secret) — ExamSessionGateway calls jwt.verifyAsync with an
    // explicit secret per-call, same as AuthService does.
    JwtModule.register({}),
    // agent:join must check the student has an Enrollment for this
    // session's course before letting them in (Security rule 1).
    CourseModule,
  ],
  controllers: [ExamSessionController],
  providers: [
    ExamSessionService,
    ExamSessionGateway,
    ExamSessionEvents,
    ExamSessionScheduler,
  ],
  // Exported so a future module can inject ExamSessionService
  // (findByCode/listRequiredDeliverables) instead of writing its own
  // TypeORM queries.
  exports: [ExamSessionService],
})
export class ExamSessionModule {}
