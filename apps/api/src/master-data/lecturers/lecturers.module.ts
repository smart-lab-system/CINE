import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LecturerEntity } from './lecturer.entity';
import { LecturersService } from './lecturers.service';
import { LecturersController } from './lecturers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LecturerEntity])],
  controllers: [LecturersController],
  providers: [LecturersService],
})
export class LecturersModule {}
