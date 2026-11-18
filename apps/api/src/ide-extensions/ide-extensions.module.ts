import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassEntity } from '../course/entities/class.entity';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { RequiredDeliverableEntity } from '../exam-session/entities/required-deliverable.entity';
import { GradingModule } from '../grading/grading.module';
import { CourseEntity } from '../master-data/entities/course.entity';
import { StudentEntity } from '../master-data/entities/student.entity';
import { RoomEntity } from '../master-data/entities/room.entity';
import { ComputerEntity } from '../master-data/entities/computer.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import { StorageModule } from '../storage/storage.module';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { IdeExtensionEntity } from './entities/ide-extension.entity';
import { IdeExtensionVersionEntity } from './entities/ide-extension-version.entity';
import { IdeExtensionPolicyEntity } from './entities/ide-extension-policy.entity';
import { IdeExtensionPolicyItemEntity } from './entities/ide-extension-policy-item.entity';
import { IdeExtensionScanEntity } from './entities/ide-extension-scan.entity';
import { IdeExtensionScanItemEntity } from './entities/ide-extension-scan-item.entity';
import { IdeExtensionSessionSummaryEntity } from './entities/ide-extension-session-summary.entity';
import { IdeExtensionJplagRunEntity } from './entities/ide-extension-jplag-run.entity';
import { LabMgmtMachineEntity } from './entities/lab-mgmt-machine.entity';
import { LabMgmtSessionEntity } from './entities/lab-mgmt-session.entity';
import { LabRoomProposalEntity } from './entities/lab-room-proposal.entity';
import { LabRoomProposalMachineEntity } from './entities/lab-room-proposal-machine.entity';
import { IDE_EXTENSION_EXTRACT_QUEUE } from './extract/ide-extension-extract.constants';
import { IdeExtensionExtractProcessor } from './extract/ide-extension-extract.processor';
import { IdeExtensionExtractService } from './extract/ide-extension-extract.service';
import { IdeExtensionJplagDemoService } from './jplag/jplag-demo.service';
import { IDE_EXTENSION_JPLAG_QUEUE } from './jplag/jplag-exam.constants';
import { JplagExamProcessor } from './jplag/jplag-exam.processor';
import { JplagExamService } from './jplag/jplag-exam.service';
import { JplagRunnerService } from './jplag/jplag-runner.service';
import { IdeExtensionsController } from './ide-extensions.controller';
import { IdeExtensionsLabController } from './ide-extensions-lab.controller';
import { IdeExtensionsService } from './ide-extensions.service';

@Module({
  imports: [
    StorageModule,
    GradingModule,
    BullModule.registerQueue({ name: IDE_EXTENSION_EXTRACT_QUEUE }),
    BullModule.registerQueue({ name: IDE_EXTENSION_JPLAG_QUEUE }),
    TypeOrmModule.forFeature([
      IdeExtensionEntity,
      IdeExtensionVersionEntity,
      IdeExtensionPolicyEntity,
      IdeExtensionPolicyItemEntity,
      IdeExtensionScanEntity,
      IdeExtensionScanItemEntity,
      IdeExtensionSessionSummaryEntity,
      IdeExtensionJplagRunEntity,
      LabMgmtSessionEntity,
      LabMgmtMachineEntity,
      LabRoomProposalEntity,
      LabRoomProposalMachineEntity,
      RoomEntity,
      ComputerEntity,
      AccountEntity,
      ExamSessionEntity,
      ClassEntity,
      CourseEntity,
      StudentEntity,
      SubmissionEntity,
      RequiredDeliverableEntity,
    ]),
  ],
  controllers: [IdeExtensionsController, IdeExtensionsLabController],
  providers: [
    IdeExtensionsService,
    IdeExtensionExtractService,
    IdeExtensionExtractProcessor,
    JplagRunnerService,
    IdeExtensionJplagDemoService,
    JplagExamService,
    JplagExamProcessor,
  ],
  exports: [IdeExtensionsService, JplagRunnerService, JplagExamService],
})
export class IdeExtensionsModule {}
