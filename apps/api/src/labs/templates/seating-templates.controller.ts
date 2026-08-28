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
import { SeatingTemplatesService } from './seating-templates.service';
import { CreateSeatingTemplateDto } from './dto/create-seating-template.dto';
import { UpdateSeatingTemplateDto } from './dto/update-seating-template.dto';
import {
  CreateSeatingTemplateResponseDto,
  SeatingTemplateViewDto,
  SeatingTemplatesListResponseDto,
} from './dto/seating-template-response.dto';

@ApiTags('seating-templates')
@Controller('seating-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SeatingTemplatesController {
  constructor(private readonly templates: SeatingTemplatesService) {}

  @Post()
  @ApiOkResponse({ type: CreateSeatingTemplateResponseDto })
  create(@Body() dto: CreateSeatingTemplateDto) {
    return this.templates.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: SeatingTemplatesListResponseDto })
  search(@Query() query: PaginationQueryDto) {
    return this.templates.search(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: SeatingTemplateViewDto })
  findOne(@Param('id') id: string) {
    return this.templates.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: SeatingTemplateViewDto })
  update(@Param('id') id: string, @Body() dto: UpdateSeatingTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.templates.remove(id);
  }
}
