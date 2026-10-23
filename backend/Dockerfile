# TopPic API. Build from the backend folder:  docker build -t toppic-api backend
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
# `prisma generate` needs a URL only to satisfy the config file; no connection is made.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY package.json ./
EXPOSE 8080
# Apply migrations on release (Fly: release_command, Railway/Render: pre-deploy), then start the server.
CMD ["node", "dist/server.js"]
