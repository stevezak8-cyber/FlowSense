# FlowSense — multi-stage production build
# Stage 1: build the React frontend
# Stage 2: build the TypeScript backend
# Stage 3: lean production image (backend + frontend/dist)

# ── Stage 1: Frontend build ──────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build
# Output: /app/frontend/dist/

# ── Stage 2: Backend build ───────────────────────────────────────────────────
FROM node:22-alpine AS backend-build
WORKDIR /app/backend

COPY backend/package*.json ./
# Install all deps (including dev) so tsc is available
RUN npm ci

COPY backend/ ./
# Generate Prisma client then compile TypeScript
RUN npx prisma generate && npm run build
# Output: /app/backend/dist/

# ── Stage 3: Production image ────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Backend: production deps only
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Compiled backend
COPY --from=backend-build /app/backend/dist ./backend/dist

# Prisma client (generated, platform-specific)
COPY --from=backend-build /app/backend/node_modules/.prisma ./backend/node_modules/.prisma

# Prisma schema + migrations (needed for prisma migrate deploy at release)
COPY backend/prisma ./backend/prisma

# Frontend static build — Express serves this in production
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "dist/index.js"]
