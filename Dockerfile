# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
COPY openapi/ openapi/
RUN npm run build            # compiles to dist/

# Runtime stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev        # install only prod deps
COPY --from=build /app/dist dist/
CMD ["node", "dist/server.js"]
