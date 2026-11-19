# Production Dockerfile for Google Cloud Run Free Tier or Render Docker
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json .npmrc* ./
RUN if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; else npm install --legacy-peer-deps --no-audit --no-fund; fi

COPY . .
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_DATABASE_ID="(default)"
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

EXPOSE 3000

CMD ["node", "server.ts"]
