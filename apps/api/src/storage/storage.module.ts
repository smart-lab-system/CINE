import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Exported so SubmissionModule can inject StorageService instead of
 * constructing its own S3Client — one client, one place that reads the
 * STORAGE_* env vars.
 */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
