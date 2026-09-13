FROM node:22.22.2-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/core/package.json ./packages/core/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm --filter @resilient-riches/server --prod deploy /runtime/apps/server

FROM node:22.22.2-bookworm-slim AS runtime
ENV NODE_ENV=production RR_HOST=0.0.0.0 RR_PORT=8080 RR_DATABASE_PATH=/app/data/resilient-riches.sqlite
WORKDIR /app
COPY --from=build /runtime/apps/server ./apps/server
COPY --from=build /workspace/apps/web/dist ./apps/web/dist
COPY LICENSE README.md ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "apps/server/dist/healthcheck.js"]
CMD ["node", "apps/server/dist/start.js"]
