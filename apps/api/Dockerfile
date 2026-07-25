FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs ./
COPY apps/api/package.json apps/api/package.json
COPY packages/core/package.json packages/core/package.json
RUN pnpm install --frozen-lockfile --filter @verifact/api...

FROM dependencies AS builder
COPY apps/api apps/api
COPY packages/core packages/core
RUN pnpm --filter @verifact/api build

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 verifact && adduser --system --uid 1001 verifact
COPY --from=builder --chown=verifact:verifact /app/apps/api/dist ./dist
USER verifact
EXPOSE 4000
CMD ["node", "dist/server.js"]
