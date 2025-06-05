# Stage 1: Build
FROM node:22-alpine as builder
WORKDIR /app

COPY package*.json ./
RUN npm i

COPY tsconfig.json ./
COPY src ./src

RUN npm run build
RUN npm prune --omit=dev

# Stage 2: Run
FROM node:22-alpine AS runtime
WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

ENV TRANSPORT=http
ENV HTTP_PORT=8000

CMD ["node", "dist/index.js"]
