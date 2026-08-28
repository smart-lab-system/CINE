import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { PaginationQueryDto } from '../../master-data/dto/common/pagination-query.dto';
import { LayoutsService } from './layouts.service';
import { CreateLayoutDto } from './dto/create-layout.dto';
import { UpdateLayoutDto } from './dto/update-layout.dto';
import { BulkUpsertSeatsDto } from './dto/bulk-upsert-seats.dto';
import { ApplyTemplateDto } from './dto/apply-template.dto';
import {
  CreateLayoutResponseDto,
  LayoutDetailDto,
  LayoutViewDto,
  LayoutsListResponseDto,
  SeatsListResponseDto,
} from './dto/layout-response.dto';

@ApiTags('labs')
@Controller('labs/:labId/layouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class LayoutsController {
  constructor(private readonly layouts: LayoutsService) {}

  @Post()
  @ApiOkResponse({ type: CreateLayoutResponseDto })
  create(@Param('labId') labId: string, @Body() dto: CreateLayoutDto) {
    return this.layouts.create(labId, dto);
  }

  @Get()
  @ApiOkResponse({ type: LayoutsListResponseDto })
  search(
    @Param('labId') labId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.layouts.search(labId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: LayoutDetailDto })
  findOne(@Param('labId') labId: string, @Param('id') id: string) {
    return this.layouts.findOne(labId, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: LayoutViewDto })
  update(
    @Param('labId') labId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLayoutDto,
  ) {
    return this.layouts.update(labId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('labId') labId: string, @Param('id') id: string) {
    await this.layouts.remove(labId, id);
  }

  @Post(':id/activate')
  @ApiOkResponse({ type: LayoutViewDto })
  activate(@Param('labId') labId: string, @Param('id') id: string) {
    return this.layouts.activate(labId, id);
  }

  @Post(':id/apply-template')
  @HttpCode(200)
  @ApiOkResponse({ type: LayoutDetailDto })
  applyTemplate(
    @Param('labId') labId: string,
    @Param('id') id: string,
    @Body() dto: ApplyTemplateDto,
  ) {
    return this.layouts.applyTemplate(labId, id, dto);
  }

  @Put(':id/seats')
  @ApiOkResponse({ type: SeatsListResponseDto })
  bulkUpsertSeats(
    @Param('labId') labId: string,
    @Param('id') id: string,
    @Body() dto: BulkUpsertSeatsDto,
  ) {
    return this.layouts.bulkUpsertSeats(labId, id, dto);
  }

  @Delete(':id/seats/:seatId')
  @HttpCode(204)
  async removeSeat(
    @Param('labId') labId: string,
    @Param('id') id: string,
    @Param('seatId') seatId: string,
  ) {
    await this.layouts.removeSeat(labId, id, seatId);
  }
}
