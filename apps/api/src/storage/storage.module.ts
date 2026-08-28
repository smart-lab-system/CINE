import { Global, Module } from '@nestjs/common';
import { MemoryObjectStorage } from './memory-object-storage';
import { MinioObjectStorage } from './minio-object-storage';
import { OBJECT_STORAGE } from './object-storage';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      useFactory: () => {
        if (!process.env.MINIO_ENDPOINT) {
          return new MemoryObjectStorage();
        }
        return new MinioObjectStorage({
          endPoint: process.env.MINIO_ENDPOINT,
          port: Number(process.env.MINIO_PORT ?? '9000'),
          useSSL: process.env.MINIO_USE_SSL === 'true',
          accessKey: process.env.MINIO_ACCESS_KEY ?? '',
          secretKey: process.env.MINIO_SECRET_KEY ?? '',
        });
      },
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
