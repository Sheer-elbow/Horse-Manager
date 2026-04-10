FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# `--ignore-scripts` blocks arbitrary lifecycle scripts from dependencies;
# esbuild/rollup native binaries are still installed via optionalDependencies.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
