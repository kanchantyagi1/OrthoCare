# Multi-stage build so the final image ships no C/C++ compilers.
# Works on both amd64 and arm64 (t4g/Graviton) via the official multi-arch node image.
#
# node_modules (including devDependencies - ts-node/tsconfig-paths/typeorm's CLI are used
# for one-off `migration:run`/`seed:demo` commands) is built once with a C++ toolchain and
# copied as-is into the runtime stage, which uses the same base image/arch - no second
# npm install, so native bindings (bcrypt) and the exact dependency tree never drift
# between build and runtime.

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN useradd --system --create-home orthocare && mkdir -p /app/storage && chown -R orthocare:orthocare /app
USER orthocare

EXPOSE 3000
CMD ["node", "dist/main.js"]
