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

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set environment to production
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http

# Expose HTTP port for MCP Streamable HTTP transport
EXPOSE 8002

# Start server in HTTP mode
CMD ["node", "dist/index.js"]
