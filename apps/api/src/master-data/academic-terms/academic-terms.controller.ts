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
import { PaginationQueryDto } from '../dto/common/pagination-query.dto';
import { AcademicTermsService } from './academic-terms.service';
import { CreateAcademicTermDto } from './dto/create-academic-term.dto';
import { UpdateAcademicTermDto } from './dto/update-academic-term.dto';
import {
  AcademicTermViewDto,
  AcademicTermsListResponseDto,
  CreateAcademicTermResponseDto,
} from './dto/academic-term-response.dto';

@ApiTags('academic-terms')
@Controller('academic-terms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AcademicTermsController {
  constructor(private readonly terms: AcademicTermsService) {}

  @Post()
  @ApiOkResponse({ type: CreateAcademicTermResponseDto })
  create(@Body() dto: CreateAcademicTermDto) {
    return this.terms.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: AcademicTermsListResponseDto })
  search(@Query() query: PaginationQueryDto) {
    return this.terms.search(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AcademicTermViewDto })
  findOne(@Param('id') id: string) {
    return this.terms.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AcademicTermViewDto })
  update(@Param('id') id: string, @Body() dto: UpdateAcademicTermDto) {
    return this.terms.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.terms.remove(id);
  }
}
