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
import { AcademicTermsService } from './academic-terms.service';
import { CreateAcademicTermDto } from './dto/create-academic-term.dto';
import { UpdateAcademicTermDto } from './dto/update-academic-term.dto';
import { SearchAcademicTermsDto } from './dto/search-academic-terms.dto';
import {
  AcademicTermListItemDto,
  PaginatedAcademicTermsDto,
} from './dto/academic-term-list-item.dto';

@ApiTags('academic-terms')
@Controller('academic-terms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AcademicTermsController {
  constructor(private readonly terms: AcademicTermsService) {}

  @Post()
  create(@Body() dto: CreateAcademicTermDto): Promise<{ id: string }> {
    return this.terms.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedAcademicTermsDto })
  search(@Query() query: SearchAcademicTermsDto): Promise<PaginatedAcademicTermsDto> {
    return this.terms.search(query);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AcademicTermListItemDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAcademicTermDto,
  ): Promise<AcademicTermListItemDto> {
    return this.terms.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.terms.remove(id);
  }
}
