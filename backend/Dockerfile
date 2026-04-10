FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# `--ignore-scripts` blocks arbitrary lifecycle scripts from dependencies.
# Prisma engines and sharp/esbuild native binaries are still installed via
# optionalDependencies rather than postinstall scripts, and `prisma generate`
# below will fetch any missing engines explicitly.
RUN npm ci --ignore-scripts
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
RUN mkdir -p /app/uploads/horses
VOLUME ["/app/uploads"]
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
