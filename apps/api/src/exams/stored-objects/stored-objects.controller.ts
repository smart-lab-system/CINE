import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AccessTokenPayload } from '../../auth/types';
import { CreateStoredObjectDto } from './dto/create-stored-object.dto';
import { CreateStoredObjectResponseDto } from './dto/stored-object-response.dto';
import { StoredObjectsService } from './stored-objects.service';

@ApiTags('stored-objects')
@Controller('stored-objects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class StoredObjectsController {
  constructor(private readonly objects: StoredObjectsService) {}

  @Post()
  @ApiOkResponse({ type: CreateStoredObjectResponseDto })
  create(@Body() dto: CreateStoredObjectDto, @Req() req: Request) {
    const user = req.user as AccessTokenPayload;
    return this.objects.create(dto, user.sub);
  }
}
