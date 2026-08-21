import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicTermEntity } from './academic-term.entity';
import { AcademicTermsService } from './academic-terms.service';
import { AcademicTermsController } from './academic-terms.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AcademicTermEntity])],
  controllers: [AcademicTermsController],
  providers: [AcademicTermsService],
})
export class AcademicTermsModule {}
