# Gateway image with Surreal CLI for in-app full-database export/import.
# Binary comes from the same Surreal release as docker-compose surrealdb.
FROM surrealdb/surrealdb:v3.0.5 AS surreal

FROM node:20-bookworm-slim

# Surreal's HTTP export client needs the system CA bundle; without it the CLI
# fails with a opaque "builder error" and the download is an empty file.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=surreal /surreal /surreal
RUN chmod +x /surreal

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV SURREAL_BIN=/surreal
ENV NODE_ENV=production

EXPOSE 3142

CMD ["node", "server.js"]
