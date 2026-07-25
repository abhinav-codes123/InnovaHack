FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN pnpm install --frozen-lockfile --filter @verifact/web...

FROM dependencies AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY apps/web apps/web
COPY packages/core packages/core
RUN pnpm --filter @verifact/web build

FROM node:24-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 verifact && adduser --system --uid 1001 verifact
COPY --from=builder --chown=verifact:verifact /app/apps/web/.next/standalone ./
COPY --from=builder --chown=verifact:verifact /app/apps/web/.next/static ./apps/web/.next/static
USER verifact
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
