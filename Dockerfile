# Multi-stage build: build the SPA, then serve it with a minimal Node image.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY vendor ./vendor
RUN npm install --ignore-scripts
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY package.json package-lock.json* ./
COPY vendor ./vendor
RUN npm install --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
COPY server.js ./
EXPOSE 8080
CMD ["node", "server.js"]
