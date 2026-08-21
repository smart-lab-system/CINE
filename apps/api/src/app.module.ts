import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { MasterDataModule } from './master-data/master-data.module';
import { dataSourceOptions } from './database/data-source';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6390),
          // BullMQ's Worker issues blocking Redis commands (e.g. BZPOPMIN)
          // on this connection; ioredis's default finite retry limit fights
          // that and can hang the worker indefinitely. BullMQ's own docs
          // require this to be null.
          maxRetriesPerRequest: null,
        },
      }),
    }),
    HealthModule,
    AuthModule,
    AccountsModule,
    MasterDataModule,
  ],
})
export class AppModule {}
