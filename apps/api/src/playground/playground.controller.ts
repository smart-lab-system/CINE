import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreatePlaygroundRunDto,
  ExecutePlaygroundRunDto,
} from './dto/create-playground-run.dto';
import { PlaygroundService } from './playground.service';

@ApiTags('playground')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('playground')
export class PlaygroundController {
  constructor(private readonly playground: PlaygroundService) {}

  /** Tạo run từ source dán (JSON). */
  @Post('runs')
  @Roles('teacher', 'admin')
  createPaste(@Req() req: Request, @Body() dto: CreatePlaygroundRunDto) {
    return this.playground.createFromPaste(
      req.user!.sub,
      dto.language,
      dto.source ?? '',
    );
  }

  /** Nạp sample web tĩnh từ `sample project/M18_...`. */
  @Post('runs/sample-static')
  @Roles('teacher', 'admin')
  createSampleStatic(@Req() req: Request) {
    return this.playground.createFromSampleStatic(req.user!.sub);
  }

  /** Nạp sample Spring Boot Shopping. */
  @Post('runs/sample-spring-boot')
  @Roles('teacher', 'admin')
  createSampleSpring(@Req() req: Request) {
    return this.playground.createFromSampleSpringBoot(req.user!.sub);
  }

  /** Nạp sample Vite + React PTUD. */
  @Post('runs/sample-vite-react')
  @Roles('teacher', 'admin')
  createSampleVite(@Req() req: Request) {
    return this.playground.createFromSampleViteReact(req.user!.sub);
  }

  /** Nạp sample Express CNM. */
  @Post('runs/sample-express')
  @Roles('teacher', 'admin')
  createSampleExpress(@Req() req: Request) {
    return this.playground.createFromSampleExpress(req.user!.sub);
  }

  /** Tạo run từ upload file / zip (multipart). */
  @Post('runs/upload')
  @Roles('teacher', 'admin')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['language', 'files'],
      properties: {
        language: {
          type: 'string',
          enum: [
            'c',
            'cpp',
            'java',
            'python',
            'static',
            'spring-boot',
            'vite-react',
            'express',
          ],
        },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 200, {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  createUpload(
    @Req() req: Request,
    @Body('language') language: string,
    @Body('paths') pathsRaw: string | string[] | undefined,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const paths = Array.isArray(pathsRaw)
      ? pathsRaw
      : typeof pathsRaw === 'string' && pathsRaw.length > 0
        ? [pathsRaw]
        : undefined;
    return this.playground.createFromUploads(req.user!.sub, language, files ?? [], paths);
  }

  @Get('runs/:id')
  @Roles('teacher', 'admin')
  get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.playground.getForOwner(id, req.user!.sub);
  }

  @Post('runs/:id/execute')
  @Roles('teacher', 'admin')
  execute(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExecutePlaygroundRunDto,
  ) {
    return this.playground.execute(id, req.user!.sub, dto.entryPath);
  }

  /** Dừng nginx preview (web tĩnh). */
  @Post('runs/:id/stop')
  @Roles('teacher', 'admin')
  stop(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.playground.stop(id, req.user!.sub);
  }
}
