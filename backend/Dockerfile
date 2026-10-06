# Multi-stage build so the final image ships no compilers/devDependencies.
# Works on both amd64 and arm64 (t4g/Graviton) via the official multi-arch node image.

FROM node:20-bookworm-slim AS build
WORKDIR /app
# bcrypt needs a C++ toolchain to compile its native binding if no prebuilt
# matches this exact base image/arch combination.
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
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && apt-get purge -y python3 make g++ && apt-get autoremove -y
COPY --from=build /app/dist ./dist
# ts-node + tsconfig-paths are devDependencies but migration:run/seed:demo need
# them at deploy time (run as one-off `docker compose exec` commands, not on
# every boot) - install just those two on top of the prod install.
RUN npm install --no-save ts-node tsconfig-paths typeorm
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN useradd --system --create-home orthocare && mkdir -p /app/storage && chown -R orthocare:orthocare /app
USER orthocare

EXPOSE 3000
CMD ["node", "dist/main.js"]
