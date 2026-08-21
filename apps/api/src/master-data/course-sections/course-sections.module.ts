import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseSectionEntity } from './course-section.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { AcademicTermEntity } from '../academic-terms/academic-term.entity';
import { CourseSectionsService } from './course-sections.service';
import { CourseSectionsController } from './course-sections.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CourseSectionEntity, SubjectEntity, AcademicTermEntity]),
  ],
  controllers: [CourseSectionsController],
  providers: [CourseSectionsService],
})
export class CourseSectionsModule {}
