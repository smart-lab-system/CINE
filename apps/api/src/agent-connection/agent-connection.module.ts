import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentConnectionEventEntity } from './entities/agent-connection-event.entity';
import { EnrollmentEntity } from '../course/entities/enrollment.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { AttendanceService } from './attendance.service';

/**
 * The attendance log — who was in the room, and when.
 *
 * Registers other modules' entities rather than importing those modules:
 * reading enrollment, class and submission rows here is a read of the same
 * database, and importing ExamSessionModule (which imports this one, for
 * the gateway) would be a cycle. CLAUDE.md's backend rule 2 says extract
 * rather than reach for forwardRef, and the thing extracted here is the
 * query, not a service.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentConnectionEventEntity,
      EnrollmentEntity,
      ClassEntity,
      SubmissionEntity,
    ]),
  ],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AgentConnectionModule {}
