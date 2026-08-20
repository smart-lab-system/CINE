FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at container runtime — so it must be passed as a build ARG (see
# docker-compose.yml's api/web `build.args`), not just a runtime `environment:`.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter web build

FROM base AS runtime
ENV NODE_ENV=production
# next.config.ts's `output: 'standalone'` already traces and copies only
# the production dependencies each page needs into .next/standalone, so
# (unlike the API image) there's no pnpm-symlink concern here.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
