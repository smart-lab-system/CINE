import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AccessTokenPayload } from '../../auth/types';
import { PaginationQueryDto } from '../../master-data/dto/common/pagination-query.dto';
import { CreateLabRoomProposalDto } from './dto/create-lab-room-proposal.dto';
import {
  CreateLabFromProposalResponseDto,
  CreateLabRoomProposalResponseDto,
  LabRoomProposalViewDto,
  LabRoomProposalsListResponseDto,
} from './dto/lab-room-proposal-response.dto';
import { LabRoomProposalsService } from './lab-room-proposals.service';

@ApiTags('labs')
@Controller('lab-room-proposals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class LabRoomProposalsController {
  constructor(private readonly proposals: LabRoomProposalsService) {}

  @Post()
  @ApiOkResponse({ type: CreateLabRoomProposalResponseDto })
  create(@Body() dto: CreateLabRoomProposalDto, @Req() req: Request) {
    const user = req.user as AccessTokenPayload;
    return this.proposals.create(dto, user.sub, user.username);
  }

  @Get()
  @ApiOkResponse({ type: LabRoomProposalsListResponseDto })
  search(@Query() query: PaginationQueryDto) {
    return this.proposals.search(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: LabRoomProposalViewDto })
  findOne(@Param('id') id: string) {
    return this.proposals.findOne(id);
  }

  @Post(':id/create-lab')
  @ApiOkResponse({ type: CreateLabFromProposalResponseDto })
  createLab(@Param('id') id: string) {
    return this.proposals.createLabFromProposal(id);
  }
}
