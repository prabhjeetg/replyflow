# Production Dockerfile for Google Cloud Run Free Tier or Render Docker
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json .npmrc* ./
RUN if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; else npm install --legacy-peer-deps --no-audit --no-fund; fi

COPY . .
RUN npm run build

# Production runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json .npmrc* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --legacy-peer-deps; else npm install --omit=dev --legacy-peer-deps --no-audit --no-fund; fi

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/src/lib/matcher.ts ./src/lib/matcher.ts
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/firebase-applet-config.json* ./

EXPOSE 3000

CMD ["node", "server.ts"]
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
