import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoomService } from './room.service';

// Any authenticated account may read the room list (needed by the
// create-exam-session form) — no @Roles(...) restriction, matching
// ExamSessionController's posture, not AccountsController's admin-only one.
@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomController {
  constructor(private readonly rooms: RoomService) {}

  @Get()
  findAll() {
    return this.rooms.findAll();
  }
}
