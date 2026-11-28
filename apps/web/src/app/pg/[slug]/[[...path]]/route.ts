import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function apiBase(): string {
  return (
    process.env.PLAYGROUND_API_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:4000'
  ).replace(/\/$/, '');
}

async function proxyToApi(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; path?: string[] }> },
): Promise<Response> {
  const { slug, path: segments } = await ctx.params;
  const rest = (segments ?? []).map(encodeURIComponent).join('/');
  const url = new URL(req.url);
  const target = `${apiBase()}/playground/proxy/${encodeURIComponent(slug)}${rest ? `/${rest}` : ''}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') return;
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'transfer-encoding' || lower === 'connection') return;
    outHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; path?: string[] }> },
) {
  return proxyToApi(req, ctx);
}

export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; path?: string[] }> },
) {
  return proxyToApi(req, ctx);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; path?: string[] }> },
) {
  return proxyToApi(req, ctx);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; path?: string[] }> },
) {
  return proxyToApi(req, ctx);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; path?: string[] }> },
) {
  return proxyToApi(req, ctx);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; path?: string[] }> },
) {
  return proxyToApi(req, ctx);
}
