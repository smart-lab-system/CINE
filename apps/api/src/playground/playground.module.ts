import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaygroundRunEntity } from './entities/playground-run.entity';
import { PLAYGROUND_QUEUE } from './playground.constants';
import { PlaygroundController } from './playground.controller';
import { PlaygroundProcessor } from './playground.processor';
import { PlaygroundScheduler } from './playground.scheduler';
import { PlaygroundService } from './playground.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlaygroundRunEntity]),
    BullModule.registerQueue({ name: PLAYGROUND_QUEUE }),
  ],
  controllers: [PlaygroundController],
  providers: [PlaygroundService, PlaygroundProcessor, PlaygroundScheduler],
})
export class PlaygroundModule {}
