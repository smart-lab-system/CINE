import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../storage/storage.module';
import { PlaygroundRunEntity } from './entities/playground-run.entity';
import { PLAYGROUND_QUEUE } from './playground.constants';
import { PlaygroundController } from './playground.controller';
import { PlaygroundProxyController } from './playground-proxy.controller';
import { PlaygroundProcessor } from './playground.processor';
import { PlaygroundScheduler } from './playground.scheduler';
import { PlaygroundService } from './playground.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlaygroundRunEntity]),
    BullModule.registerQueue({ name: PLAYGROUND_QUEUE }),
    StorageModule,
  ],
  controllers: [PlaygroundController, PlaygroundProxyController],
  providers: [PlaygroundService, PlaygroundProcessor, PlaygroundScheduler],
})
export class PlaygroundModule {}
