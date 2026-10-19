import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassEntity } from '../course/entities/class.entity';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { StudentEntity } from '../master-data/entities/student.entity';
import { RoomEntity } from '../master-data/entities/room.entity';
import { ComputerEntity } from '../master-data/entities/computer.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import { IdeExtensionEntity } from './entities/ide-extension.entity';
import { IdeExtensionVersionEntity } from './entities/ide-extension-version.entity';
import { IdeExtensionPolicyEntity } from './entities/ide-extension-policy.entity';
import { IdeExtensionPolicyItemEntity } from './entities/ide-extension-policy-item.entity';
import { IdeExtensionScanEntity } from './entities/ide-extension-scan.entity';
import { IdeExtensionScanItemEntity } from './entities/ide-extension-scan-item.entity';
import { IdeExtensionSessionSummaryEntity } from './entities/ide-extension-session-summary.entity';
import { LabMgmtMachineEntity } from './entities/lab-mgmt-machine.entity';
import { LabMgmtSessionEntity } from './entities/lab-mgmt-session.entity';
import { LabRoomProposalEntity } from './entities/lab-room-proposal.entity';
import { LabRoomProposalMachineEntity } from './entities/lab-room-proposal-machine.entity';
import { IdeExtensionsController } from './ide-extensions.controller';
import { IdeExtensionsLabController } from './ide-extensions-lab.controller';
import { IdeExtensionsService } from './ide-extensions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IdeExtensionEntity,
      IdeExtensionVersionEntity,
      IdeExtensionPolicyEntity,
      IdeExtensionPolicyItemEntity,
      IdeExtensionScanEntity,
      IdeExtensionScanItemEntity,
      IdeExtensionSessionSummaryEntity,
      LabMgmtSessionEntity,
      LabMgmtMachineEntity,
      LabRoomProposalEntity,
      LabRoomProposalMachineEntity,
      RoomEntity,
      ComputerEntity,
      AccountEntity,
      ExamSessionEntity,
      ClassEntity,
      StudentEntity,
    ]),
  ],
  controllers: [IdeExtensionsController, IdeExtensionsLabController],
  providers: [IdeExtensionsService],
  exports: [IdeExtensionsService],
})
export class IdeExtensionsModule {}
