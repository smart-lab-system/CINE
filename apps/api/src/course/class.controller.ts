import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClassService } from './class.service';
import { CreateClassDto, UpdateClassDto } from './dto/course.dto';

/**
 * Two different "mine" here, because two roles have a legitimate but
 * different claim on a class: the Trưởng khoa who owns its course, and the
 * lecturer who runs it.
 */
@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassController {
  constructor(private readonly classes: ClassService) {}

  @Get('mine')
  @Roles('department_admin')
  findMine(@Req() req: Request) {
    return this.classes.findForHead(req.user!.sub);
  }

  @Get('teaching')
  @Roles('teacher')
  findTeaching(@Req() req: Request) {
    return this.classes.findForTeacher(req.user!.sub);
  }

  @Post()
  @Roles('department_admin')
  create(@Body() dto: CreateClassDto, @Req() req: Request) {
    return this.classes.createForHead(req.user!.sub, dto);
  }

  @Patch(':id')
  @Roles('department_admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassDto,
    @Req() req: Request,
  ) {
    return this.classes.updateForHead(id, req.user!.sub, dto);
  }

  @Delete(':id')
  @Roles('department_admin')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.classes.removeForHead(id, req.user!.sub);
  }
}
