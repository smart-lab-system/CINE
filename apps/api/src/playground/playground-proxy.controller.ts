import {
  All,
  Controller,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { request as httpRequest } from 'node:http';
import { PlaygroundService } from './playground.service';

/**
 * Proxy công khai (không JWT): `/playground/proxy/:slug/...` → `127.0.0.1:hostPort`.
 * Trình duyệt tải CSS/JS qua examcine.site/pg/... không gửi Bearer.
 */
@ApiTags('playground')
@Controller('playground/proxy')
export class PlaygroundProxyController {
  constructor(private readonly playground: PlaygroundService) {}

  @All(':slug')
  async proxySlugOnly(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.forward(slug, '', req, res);
  }

  /** Nest 10 + path-to-regexp: `(.*)` bắt phần còn lại sau slug. */
  @All(':slug/(.*)')
  async proxySlugNested(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const prefix = `/playground/proxy/${slug}`;
    const pathOnly = (req.path || '').split('?')[0] ?? '';
    const rest = pathOnly.startsWith(prefix) ? pathOnly.slice(prefix.length).replace(/^\/+/, '') : '';
    return this.forward(slug, rest, req, res);
  }

  private async forward(slugRaw: string, restPath: string, req: Request, res: Response) {
    const slug = slugRaw.trim().toLowerCase();
    if (!slug) {
      throw new NotFoundException('Thiếu slug preview.');
    }

    const target = await this.playground.resolveProxyTarget(slug);
    if (!target) {
      throw new NotFoundException('Preview không tồn tại hoặc đã hết hạn.');
    }

    const rest = restPath.replace(/^\/+/, '');
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const upstreamPath = `/${rest}${qs}`;

    await new Promise<void>((resolve) => {
      const upstream = httpRequest(
        {
          hostname: '127.0.0.1',
          port: target.hostPort,
          path: upstreamPath,
          method: req.method,
          headers: {
            ...stripHopByHop(req.headers as Record<string, string | string[] | undefined>),
            host: `127.0.0.1:${target.hostPort}`,
          },
        },
        (upRes) => {
          res.status(upRes.statusCode ?? 502);
          for (const [key, value] of Object.entries(upRes.headers)) {
            if (value == null) continue;
            if (HOP_BY_HOP.has(key.toLowerCase())) continue;
            res.setHeader(key, value);
          }
          upRes.pipe(res);
          upRes.on('end', () => resolve());
          upRes.on('error', () => resolve());
        },
      );
      upstream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(502).json({
            message: `Không nối được preview local: ${err.message}`,
          });
        }
        resolve();
      });
      if (req.method === 'GET' || req.method === 'HEAD') {
        upstream.end();
      } else {
        req.pipe(upstream);
      }
    });
  }
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function stripHopByHop(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}
