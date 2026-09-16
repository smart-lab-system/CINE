import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseModule } from '../course/course.module';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { ExamMaterialEntity } from './entities/exam-material.entity';
import { RequiredDeliverableEntity } from './entities/required-deliverable.entity';
import { ExamSessionService } from './exam-session.service';
import { ExamSessionReassignService } from './exam-session-reassign.service';
import { CollectionPhaseService } from './collection-phase.service';
import { RecollectService } from './recollect.service';
import { SessionRosterService } from './session-roster.service';
import { SessionRosterEntity } from './entities/session-roster.entity';
import { ExamMaterialService } from './exam-material.service';
import { AccountEntity } from '../identity/entities/account.entity';
import { ExamSessionController } from './exam-session.controller';
import { ExamSessionGateway } from './exam-session.gateway';
import { ExamSessionEvents } from './exam-session.events';
import { ExamSessionScheduler } from './exam-session.scheduler';
import { AccessRequestGateway } from './access-request.gateway';
import { AccessRequestStore } from './access-request.store';
import { AgentJoinLockStore } from './agent-join-lock.store';
import { ScheduleConflictService } from './schedule-conflict.service';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { SessionLifecycleService } from './session-lifecycle.service';
import { AdminModule } from '../admin/admin.module';
import { AgentConnectionModule } from '../agent-connection/agent-connection.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExamSessionEntity,
      SessionRosterEntity,
      RequiredDeliverableEntity,
      ExamMaterialEntity,
      // Only so ExamSessionService can check a rubric belongs to the
      // session's course. Deliberately the entity and not GradingModule:
      // GradingModule imports THIS module, and importing it back would be a
      // cycle needing forwardRef.
      RubricEntity,
      // ExamSessionReassignService kiểm tài khoản đích thật là giảng viên
      // và còn hoạt động, trước khi giao phiên thi cho họ. Entity chứ
      // không phải AccountsModule: một `findOne` không đáng để kéo cả
      // module (và cả AccountsController) vào graph.
      AccountEntity,
    ]),
    // Registered the same way AuthModule does (JwtModule.register({}) with
    // no default secret) — ExamSessionGateway calls jwt.verifyAsync with an
    // explicit secret per-call, same as AuthService does.
    JwtModule.register({}),
    // agent:join must check the student has an Enrollment for this
    // session's course before letting them in (Security rule 1).
    CourseModule,
    // Approving an access request opens a rule the machine enforces, so the
    // opening is written to audit_log.
    AdminModule,
    // Every join and disconnect goes in the attendance log, which is what
    // makes the lobby survive a refresh and the headcount mean anything.
    AgentConnectionModule,
    // agent:join answers whether a snapshot is waiting, so a wiped machine
    // learns it can be restored at the only moment it would ask.
    StorageModule,
  ],
  controllers: [ExamSessionController],
  providers: [
    ExamSessionService,
    ExamSessionReassignService,
    CollectionPhaseService,
    RecollectService,
    SessionRosterService,
    ScheduleConflictService,
    SessionLifecycleService,
    ExamMaterialService,
    ExamSessionGateway,
    ExamSessionEvents,
    ExamSessionScheduler,
    AccessRequestStore,
    AccessRequestGateway,
    AgentJoinLockStore,
  ],
  // Exported so a future module can inject ExamSessionService
  // (findByCode/listRequiredDeliverables) instead of writing its own
  // TypeORM queries.
  exports: [ExamSessionService, SessionRosterService],
})
export class ExamSessionModule {}
