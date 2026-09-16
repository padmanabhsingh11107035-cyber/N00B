# Multi-stage build so the final image only ships production dependencies
# plus the already-compiled output (dist/ frontend, dist-server/server.cjs)
# — not the TypeScript source, dev tooling, or build-time-only deps.

FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# The platform (Koyeb, Render, etc.) injects its own PORT at runtime —
# server.ts already reads process.env.PORT with a 3000 fallback, so this
# EXPOSE is documentation only, not a behavior change.
EXPOSE 8000

CMD ["node", "dist-server/server.cjs"]
