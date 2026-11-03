FROM oven/bun:1.4.2-slim AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile --ignore-scripts

FROM dependencies AS build
COPY . .
RUN bun run build

FROM dependencies AS production-dependencies
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
    && bun install --frozen-lockfile --production --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/api ./apps/api
COPY --from=production-dependencies /app/packages ./packages
COPY package.json ./
COPY apps/api/src ./apps/api/src
COPY packages ./packages
COPY --from=build /app/apps/web/dist ./apps/web/dist
USER bun
EXPOSE 3000
CMD ["bun", "apps/api/src/index.ts"]
