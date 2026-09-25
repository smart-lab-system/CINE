import 'reflect-metadata';
// Must run before `./app.module` is imported below. `app.module.ts`
// statically imports ExamSessionModule -> ExamSessionGateway, whose
// `@WebSocketGateway({ cors: { origin: process.env.WEB_ORIGIN ... } })`
// decorator argument is evaluated the instant that file is `require`d —
// i.e. as a side effect of the `AppModule` import below, well before
// `NestFactory.create()` runs any Nest lifecycle code (including
// `ConfigModule.forRoot()`). Without this, `process.env.WEB_ORIGIN` can
// still be undefined when the gateway reads it, while `main.ts`'s own
// HTTP CORS (further down, inside `bootstrap()`) reads it later and would
// see a value — the two could silently diverge. Same pattern already used
// in `./database/data-source.ts` for the same reason; ours must come
// first because CommonJS `require()` runs each import in this file's
// top-to-bottom order, and `AppModule`'s import chain reaches
// `data-source.ts` (and its own `dotenv/config`) only *after* it reaches
// `ExamSessionModule`/the gateway — too late to help here.
import 'dotenv/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PostgresExceptionFilter } from './common/postgres-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Manually instantiated (`new`), so Nest's DI never runs property
  // injection on it — PostgresExceptionFilter's inherited
  // `httpAdapterHost` would stay undefined without this, and its fallback
  // path (`super.catch()`, for an unmapped Postgres error code) would
  // itself crash on a missing `applicationRef`. This is the same pattern
  // NestJS's own docs use for a manually-registered "catch everything"
  // filter.
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new PostgresExceptionFilter(httpAdapter));
  // Nest's ApplicationConfig has no default WebSocket adapter (it's `null`
  // until set here) — without this, ExamSessionGateway ("/exam-live")
  // throws at connection time (WebSocketsController calls
  // `adapter.bindClientConnect` unconditionally). Verified against
  // node_modules/@nestjs/core for this NestJS 10.4.4 install.
  app.useWebSocketAdapter(new IoAdapter(app));

  const config = new DocumentBuilder()
    .setTitle('ExamCollect API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

// Without a .catch(), a startup failure (DB unreachable, port already in
// use — hit for real during the Task 9 demo run when a leftover dev
// server from an earlier session was still bound to 4000) becomes an
// unhandled promise rejection: Node dumps a raw internal stack trace and
// exits non-zero anyway, just without ever explaining what actually went
// wrong. This makes the same non-zero exit produce one readable line
// first.
bootstrap().catch((error) => {
  console.error('API failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
