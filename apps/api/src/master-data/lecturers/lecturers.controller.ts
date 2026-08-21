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
import { LecturersService } from './lecturers.service';
import { CreateLecturerDto } from './dto/create-lecturer.dto';
import { UpdateLecturerDto } from './dto/update-lecturer.dto';
import { SearchLecturersDto } from './dto/search-lecturers.dto';
import { LecturerListItemDto, PaginatedLecturersDto } from './dto/lecturer-list-item.dto';

@ApiTags('lecturers')
@Controller('lecturers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class LecturersController {
  constructor(private readonly lecturers: LecturersService) {}

  @Post()
  create(@Body() dto: CreateLecturerDto): Promise<{ id: string }> {
    return this.lecturers.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedLecturersDto })
  search(@Query() query: SearchLecturersDto): Promise<PaginatedLecturersDto> {
    return this.lecturers.search(query);
  }

  @Patch(':id')
  @ApiOkResponse({ type: LecturerListItemDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLecturerDto,
  ): Promise<LecturerListItemDto> {
    return this.lecturers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.lecturers.remove(id);
  }
}
