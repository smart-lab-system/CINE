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
import { LabsService } from './labs.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import {
  CreateLabResponseDto,
  LabViewDto,
  LabsListResponseDto,
} from './dto/lab-response.dto';

@ApiTags('labs')
@Controller('labs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Post()
  @ApiOkResponse({ type: CreateLabResponseDto })
  create(@Body() dto: CreateLabDto) {
    return this.labs.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: LabsListResponseDto })
  search(@Query() query: PaginationQueryDto) {
    return this.labs.search(query);
  }

  @Get(':id')
  @Roles('admin', 'lecturer')
  @ApiOkResponse({ type: LabViewDto })
  findOne(@Param('id') id: string) {
    return this.labs.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: LabViewDto })
  update(@Param('id') id: string, @Body() dto: UpdateLabDto) {
    return this.labs.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.labs.remove(id);
  }
}
