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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { SearchAccountsDto } from './dto/search-accounts.dto';

@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /**
   * Overrides the class-level @Roles('admin') for this route only: a Trưởng
   * khoa must name a lecturer when creating a class. It returns id and name
   * and nothing else, so widening the audience does not widen what leaks.
   *
   * Declared before any ':id' route so the literal segment cannot be parsed
   * as a uuid param.
   */
  @Get('teachers')
  @Roles('admin', 'department_admin')
  listTeacherOptions() {
    return this.accounts.listTeacherOptions();
  }

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.accounts.create(dto);
  }

  @Get()
  search(@Query() query: SearchAccountsDto) {
    return this.accounts.search(query);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.accounts.remove(id);
  }
}
