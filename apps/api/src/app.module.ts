import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { MasterDataModule } from './master-data/master-data.module';
import { LabsModule } from './labs/labs.module';
import { ExamsModule } from './exams/exams.module';
import { StorageModule } from './storage/storage.module';
import { dataSourceOptions } from './database/data-source';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),
    StorageModule,
    HealthModule,
    AuthModule,
    AccountsModule,
    MasterDataModule,
    LabsModule,
    ExamsModule,
  ],
})
export class AppModule {}
