FROM node:20.16.0-slim AS builder

# Set Workdir to /app
WORKDIR /app

# Install global dependencies
RUN npm install -g nx rimraf

# Copy files
COPY . .

# Install dependencies
RUN npm ci

# Build the app
RUN npm run build


# Stage 2 - Plugin Enrichment
FROM node:20.16.0-slim AS plugin-enrichment

# Set Workdir to /app
WORKDIR /app

# Copy builded files from previous stage
COPY --from=builder /app/packages/compas-open-scd/build ./build/

# Copy plugin installer script
COPY deploy/plugins/ ./plugins/

# Install packages
RUN cd plugins && npm install

# Run plugin installer script
RUN node ./plugins/plugin-installer.js ./plugins/plugins.yaml ./build/


### Stage 3
FROM nginx:latest

# Copy from packages/distribution/build to nginx
COPY --from=plugin-enrichment /app/build /usr/share/nginx/html

RUN cp /usr/share/nginx/html/public/js/plugins.js /usr/share/nginx/html/openscd/src/plugins.js
RUN cp /usr/share/nginx/html/public/js/plugins.js /usr/share/nginx/html/openscd/dist/plugins.js

# Copy nginx configuration
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf

# Expose port 80
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
