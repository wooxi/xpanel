FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN apk add --no-cache python3 make g++ \
 && npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=7002 \
    TZ=Asia/Shanghai

RUN apk add --no-cache tzdata ca-certificates \
 && mkdir -p /data && chown -R node:node /data

COPY --from=build /app/node_modules ./node_modules
COPY package.json server.js ./
COPY src ./src
COPY public ./public
COPY resources ./resources
COPY tools ./tools

RUN chmod -R a+rX /app && chown -R node:node /app

USER node
EXPOSE 7002
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:7002/ || exit 1

CMD ["node", "server.js"]
