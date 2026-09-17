import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { AdminModule } from '../admin/admin.module';
import { CourseModule } from '../course/course.module';
import { AccountEntity } from '../identity/entities/account.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { CourseEntity } from '../course/entities/course.entity';
import { RoomEntity } from '../room/entities/room.entity';
import { SemesterEntity } from '../course/entities/semester.entity';
import { RoomModule } from '../room/room.module';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

/**
 * Admin-only ensure API for demo/dev seeding. Wired into AppModule only when
 * SEED_API_ENABLED === "true" so production never registers these routes.
 */
@Module({
  imports: [
    AccountsModule,
    RoomModule,
    CourseModule,
    AdminModule,
    TypeOrmModule.forFeature([
      AccountEntity,
      SemesterEntity,
      RoomEntity,
      CourseEntity,
      ClassEntity,
    ]),
  ],
  controllers: [SeedController],
  providers: [SeedService],
})
export class SeedModule {}
