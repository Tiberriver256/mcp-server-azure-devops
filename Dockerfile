# syntax=docker/dockerfile:1

FROM node:24-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

FROM node:24-slim AS runtime

LABEL org.opencontainers.image.title="Azure DevOps MCP Server" \
      org.opencontainers.image.description="Model Context Protocol (MCP) server for Azure DevOps Services and Azure DevOps Server" \
      org.opencontainers.image.source="https://github.com/Tiberriver256/mcp-server-azure-devops" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

ENV NODE_ENV=production \
    AZURE_DEVOPS_TRANSPORT=http \
    AZURE_DEVOPS_HTTP_HOST=0.0.0.0 \
    AZURE_DEVOPS_HTTP_PORT=3000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.AZURE_DEVOPS_HTTP_PORT || 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["node", "dist/index.js"]
