# Development Dockerfile for Doc-RAG Agent
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm@latest

# Install required dependencies for Puppeteer (used by doc-rag-mcp-server)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml ./
COPY lib/arbitrum-vibekit-core/package.json ./lib/arbitrum-vibekit-core/
COPY lib/mcp-tools/doc-rag-mcp-server/package.json ./lib/mcp-tools/doc-rag-mcp-server/
COPY examples/doc-rag-agent/package.json ./examples/doc-rag-agent/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the project
RUN pnpm build

WORKDIR /app/examples/doc-rag-agent

# Expose port
EXPOSE 3008

# Start the agent
CMD ["pnpm", "dev"] 