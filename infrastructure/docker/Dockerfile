FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY --chown=node:node apps/web/package.json apps/web/package.json
COPY --chown=node:node packages/shared/package.json packages/shared/package.json
COPY --chown=node:node packages/game-engine/package.json packages/game-engine/package.json
COPY --chown=node:node apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
COPY --chown=node:node apps/api/scripts apps/api/scripts
RUN npm ci --no-audit --no-fund

FROM deps AS api
ENV NODE_ENV=production
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node apps/api apps/api
COPY --chown=node:node packages packages
RUN npm run build:api
EXPOSE 3000
CMD ["node", "apps/api/dist/main.mjs"]

FROM deps AS web-build
COPY --chown=node:node apps/web apps/web
COPY --chown=node:node packages packages
RUN npm run build -w @arena/web

FROM nginx:1.28-alpine AS web
COPY infrastructure/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist/ /usr/share/nginx/html/
EXPOSE 8080
