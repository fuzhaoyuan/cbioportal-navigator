# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install Supergateway globally for LibreChat compatibility
RUN npm install -g @modelcontextprotocol/server-supergateway

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set environment to production
ENV NODE_ENV=production

# Expose SSE port for LibreChat
EXPOSE 8002

# Use Supergateway to bridge stdio to SSE for LibreChat
# For direct stdio use (Claude Desktop), override with: docker run --entrypoint node image dist/index.js
ENTRYPOINT ["npx", "supergateway", "--stdio", "node", "dist/index.js", "--port", "8002"]
