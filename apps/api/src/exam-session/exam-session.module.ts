import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { RequiredDeliverableEntity } from './entities/required-deliverable.entity';
import { ExamSessionService } from './exam-session.service';
import { ExamSessionController } from './exam-session.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamSessionEntity, RequiredDeliverableEntity]),
  ],
  controllers: [ExamSessionController],
  providers: [ExamSessionService],
  // Exported so Task 3's WebSocket gateway module can inject
  // ExamSessionService (findByCode/listRequiredDeliverables) instead of
  // writing its own TypeORM queries.
  exports: [ExamSessionService],
})
export class ExamSessionModule {}
