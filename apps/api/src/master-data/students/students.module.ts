import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from './student.entity';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StudentEntity])],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
