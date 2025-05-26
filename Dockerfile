FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create app directory structure
RUN mkdir -p /app/schemas/collections \
             /app/schemas/functions \
             /app/config \
             /app/src \
             /app/docs

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mongorest -u 1001

# Change ownership of app directory
RUN chown -R mongorest:nodejs /app

# Switch to non-root user
USER mongorest

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "
    const http = require('http');
    const options = { host: 'localhost', port: 3000, path: '/health/live', timeout: 2000 };
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) process.exit(0);
      else process.exit(1);
    });
    req.on('error', () => process.exit(1));
    req.on('timeout', () => process.exit(1));
    req.end();
  "

# Start application
CMD ["npm", "start"]
