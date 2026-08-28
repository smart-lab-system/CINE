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
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { PaginationQueryDto } from '../../master-data/dto/common/pagination-query.dto';
import { WorkstationsService } from './workstations.service';
import { BatchRenameWorkstationsDto } from './dto/batch-rename-workstations.dto';
import { CreateWorkstationDto } from './dto/create-workstation.dto';
import { UpdateWorkstationDto } from './dto/update-workstation.dto';
import {
  CreateWorkstationResponseDto,
  WorkstationViewDto,
  WorkstationsListResponseDto,
} from './dto/workstation-response.dto';

@ApiTags('labs')
@Controller('labs/:labId/workstations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class WorkstationsController {
  constructor(private readonly workstations: WorkstationsService) {}

  @Post()
  @ApiOkResponse({ type: CreateWorkstationResponseDto })
  create(@Param('labId') labId: string, @Body() dto: CreateWorkstationDto) {
    return this.workstations.create(labId, dto);
  }

  @Get()
  @Roles('admin', 'lecturer')
  @ApiOkResponse({ type: WorkstationsListResponseDto })
  search(
    @Param('labId') labId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.workstations.search(labId, query);
  }

  @Patch('batch-rename')
  @ApiOkResponse({ type: WorkstationsListResponseDto })
  batchRename(
    @Param('labId') labId: string,
    @Body() dto: BatchRenameWorkstationsDto,
  ) {
    return this.workstations.batchRename(labId, dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: WorkstationViewDto })
  findOne(@Param('labId') labId: string, @Param('id') id: string) {
    return this.workstations.findOne(labId, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: WorkstationViewDto })
  update(
    @Param('labId') labId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkstationDto,
  ) {
    return this.workstations.update(labId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('labId') labId: string, @Param('id') id: string) {
    await this.workstations.remove(labId, id);
  }
}
