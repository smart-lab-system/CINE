FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter api build

FROM base AS runtime
ENV NODE_ENV=production
# pnpm workspaces hoist dependencies into a content-addressed store under
# the root node_modules/.pnpm, with apps/api/node_modules holding symlinks
# into it — copying apps/api/node_modules alone would ship dangling
# symlinks. Copy the whole /app tree from the build stage instead so the
# symlink structure stays intact.
COPY --from=build /app /app
EXPOSE 4000
# apps/api/tsconfig.json has no rootDir/build-only tsconfig excluding
# test/, so tsc mirrors both src/ and test/ under dist/ (dist/src/main.js,
# not dist/main.js) — verified against the actual build output.
CMD ["node", "apps/api/dist/src/main.js"]
