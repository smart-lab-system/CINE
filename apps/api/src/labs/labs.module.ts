import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabEntity } from './entities/lab.entity';
import { WorkstationEntity } from './entities/workstation.entity';
import { LabLayoutEntity } from './entities/lab-layout.entity';
import { LabSeatEntity } from './entities/lab-seat.entity';
import { LabsController } from './labs/labs.controller';
import { LabsService } from './labs/labs.service';
import { WorkstationsController } from './workstations/workstations.controller';
import { WorkstationsService } from './workstations/workstations.service';
import { LayoutsController } from './layouts/layouts.controller';
import { LayoutsService } from './layouts/layouts.service';
import { SeatingTemplatesController } from './templates/seating-templates.controller';
import { SeatingTemplatesService } from './templates/seating-templates.service';
import { SeatingTemplateEntity } from './entities/seating-template.entity';
import { LabRoomProposalEntity } from './entities/lab-room-proposal.entity';
import { LabRoomProposalsController } from './proposals/lab-room-proposals.controller';
import { LabRoomProposalsService } from './proposals/lab-room-proposals.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LabEntity,
      WorkstationEntity,
      LabLayoutEntity,
      LabSeatEntity,
      SeatingTemplateEntity,
      LabRoomProposalEntity,
    ]),
  ],
  controllers: [
    LabsController,
    WorkstationsController,
    LayoutsController,
    SeatingTemplatesController,
    LabRoomProposalsController,
  ],
  providers: [
    LabsService,
    WorkstationsService,
    LayoutsService,
    SeatingTemplatesService,
    LabRoomProposalsService,
  ],
})
export class LabsModule {}
