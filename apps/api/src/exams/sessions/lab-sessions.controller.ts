import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AccessTokenPayload } from '../../auth/types';
import { PaginationQueryDto } from '../../master-data/dto/common/pagination-query.dto';
import { LabSessionsService } from './lab-sessions.service';
import { AddParticipantDto } from './dto/add-participant.dto';
import { AssignProctorDto } from './dto/assign-proctor.dto';
import { BulkAddParticipantsDto } from './dto/bulk-add-participants.dto';
import { CreateLabSessionDto } from './dto/create-lab-session.dto';
import { TransitionLabSessionStatusDto } from './dto/transition-status.dto';
import { UpdateLabSessionDto } from './dto/update-lab-session.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import {
  BulkAddParticipantsResponseDto,
  CreateLabSessionResponseDto,
  CreateParticipantResponseDto,
  CreateProctorResponseDto,
  LabSessionDetailDto,
  LabSessionViewDto,
  LabSessionsListResponseDto,
  ParticipantsListResponseDto,
  SessionParticipantViewDto,
  SessionStatusHistoryListResponseDto,
} from './dto/lab-session-response.dto';

@ApiTags('exam-events')
@Controller('exam-events/:id/sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class LabSessionsController {
  constructor(private readonly sessions: LabSessionsService) {}

  @Post()
  @ApiOkResponse({ type: CreateLabSessionResponseDto })
  create(
    @Param('id') eventId: string,
    @Body() dto: CreateLabSessionDto,
    @Req() req: Request,
  ) {
    const user = req.user as AccessTokenPayload;
    return this.sessions.create(eventId, dto, user.sub);
  }

  @Get()
  @Roles('admin', 'lecturer')
  @ApiOkResponse({ type: LabSessionsListResponseDto })
  search(@Param('id') eventId: string, @Query() query: PaginationQueryDto) {
    return this.sessions.search(eventId, query);
  }

  @Get(':sessionId')
  @ApiOkResponse({ type: LabSessionDetailDto })
  findOne(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessions.findOne(eventId, sessionId);
  }

  @Patch(':sessionId')
  @ApiOkResponse({ type: LabSessionViewDto })
  update(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateLabSessionDto,
  ) {
    return this.sessions.update(eventId, sessionId, dto);
  }

  @Delete(':sessionId')
  @HttpCode(204)
  async remove(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
  ) {
    await this.sessions.remove(eventId, sessionId);
  }

  @Post(':sessionId/status')
  @HttpCode(200)
  @ApiOkResponse({ type: LabSessionDetailDto })
  transitionStatus(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: TransitionLabSessionStatusDto,
    @Req() req: Request,
  ) {
    const user = req.user as AccessTokenPayload;
    return this.sessions.transitionStatus(eventId, sessionId, dto, user.sub);
  }

  @Get(':sessionId/status-history')
  @ApiOkResponse({ type: SessionStatusHistoryListResponseDto })
  listStatusHistory(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessions.listStatusHistory(eventId, sessionId);
  }

  @Post(':sessionId/proctors')
  @ApiOkResponse({ type: CreateProctorResponseDto })
  addProctor(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: AssignProctorDto,
    @Req() req: Request,
  ) {
    const user = req.user as AccessTokenPayload;
    return this.sessions.addProctor(eventId, sessionId, dto, user.sub);
  }

  @Delete(':sessionId/proctors/:proctorId')
  @HttpCode(204)
  async removeProctor(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
    @Param('proctorId') proctorId: string,
  ) {
    await this.sessions.removeProctor(eventId, sessionId, proctorId);
  }

  @Get(':sessionId/participants')
  @ApiOkResponse({ type: ParticipantsListResponseDto })
  listParticipants(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessions.listParticipants(eventId, sessionId);
  }

  @Post(':sessionId/participants')
  @ApiOkResponse({ type: CreateParticipantResponseDto })
  addParticipant(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: AddParticipantDto,
  ) {
    return this.sessions.addParticipant(eventId, sessionId, dto);
  }

  @Post(':sessionId/participants/bulk')
  @ApiOkResponse({ type: BulkAddParticipantsResponseDto })
  bulkAddParticipants(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: BulkAddParticipantsDto,
  ) {
    return this.sessions.bulkAddParticipants(eventId, sessionId, dto);
  }

  @Patch(':sessionId/participants/:participantId')
  @ApiOkResponse({ type: SessionParticipantViewDto })
  updateParticipant(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
    @Param('participantId') participantId: string,
    @Body() dto: UpdateParticipantDto,
  ) {
    return this.sessions.updateParticipant(
      eventId,
      sessionId,
      participantId,
      dto,
    );
  }

  @Delete(':sessionId/participants/:participantId')
  @HttpCode(204)
  async removeParticipant(
    @Param('id') eventId: string,
    @Param('sessionId') sessionId: string,
    @Param('participantId') participantId: string,
  ) {
    await this.sessions.removeParticipant(eventId, sessionId, participantId);
  }
}
