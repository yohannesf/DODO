# dodo-server: API + built SPA in one image (spec §11)
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
RUN pnpm turbo build --filter=@dodo/server --filter=@dodo/web
RUN pnpm --filter @dodo/server --prod deploy --legacy /out/server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/server /app/server
COPY --from=build /app/packages/web/dist /app/web
ENV WEB_DIST_DIR=/app/web
EXPOSE 3000
USER node
CMD ["node", "/app/server/dist/index.js"]
