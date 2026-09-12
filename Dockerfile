# Hosted service image.
#
# Runs the workspace directly with tsx rather than emitting JS: the service imports workspace
# packages by source, and a build step would need every one of them compiled and their exports
# repointed at dist/. tsx costs a little startup time and removes a whole class of
# "works locally, differs in the image" problems.
FROM node:24-slim

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Manifests first, so a dependency install is cached independently of source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/ens-config/package.json  packages/ens-config/
COPY packages/x402-client/package.json packages/x402-client/
COPY packages/devnet/package.json      packages/devnet/
COPY packages/graph/package.json       packages/graph/
COPY packages/discovery/package.json   packages/discovery/
COPY packages/sdk/package.json         packages/sdk/
COPY service/package.json              service/
COPY agent/package.json                agent/
COPY web/package.json                  web/

# --ignore-scripts: @tollgatehq/sdk's own `prepare` script builds it with tsup, and at this point
# only manifests are copied — its source doesn't exist yet, so the build has nothing to compile.
# Deferred to an explicit build below, once the real source is in the image.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/ packages/
COPY service/  service/
COPY web/      web/
COPY agent/    agent/
COPY deployments/ deployments/
COPY docs/     docs/

RUN pnpm --filter @tollgatehq/sdk build

ENV NODE_ENV=production
# Railway injects PORT; the service reads it and falls back to 8402 locally.
CMD ["pnpm", "--filter", "@tollgate/service", "exec", "tsx", "src/main.ts"]
