import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CourseService } from './course.service';

// Any authenticated account may read the course list (needed by the
// create-exam-session form) — no @Roles(...) restriction, matching
// ExamSessionController's/RoomController's posture.
@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CourseController {
  constructor(private readonly courses: CourseService) {}

  @Get()
  findAll() {
    return this.courses.findAll();
  }
}
