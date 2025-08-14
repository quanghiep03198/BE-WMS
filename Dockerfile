FROM node:current-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable
RUN npm install pm2 -g

COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --fix-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --fix-lockfile
RUN pnpm build

FROM base

# Copy built files and ecosystem config from development stage
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY --from=base /app/ecosystem.config.js ./ecosystem.config.js

EXPOSE 3001

# CMD ["pm2-runtime", "ecosystem.config.js"]
CMD ["pnpm", "start:prod"]

