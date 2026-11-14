# --- build the static bundle -------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- serve it ----------------------------------------------------------------
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Unraid builds its Docker tile from these labels: the mark the app already serves, where the web
# UI lives, and who manages the container. [IP] and [PORT:80] are filled in by Unraid from the host
# and the mapped port. The tile is small, so the 128px variant is offered rather than a 512px one it
# would shrink anyway.
#
# `managed=dockerman` is what makes dockerman (Unraid 7's Docker manager) show the tile and button
# for a container it did not create itself, so a plain `docker run` is covered. A Compose Manager
# stack should set `composeman` in its own labels, which overrides this one.
LABEL net.unraid.docker.managed="dockerman" \
      net.unraid.docker.icon="http://[IP]:[PORT:80]/icons/icon-128.png" \
      net.unraid.docker.webui="http://[IP]:[PORT:80]/"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
