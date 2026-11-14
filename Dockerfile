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

# Unraid builds its Docker tile from these labels: where the web UI lives, and who manages the
# container. [IP] and [PORT:80] are filled in by Unraid from the host and the mapped port.
#
# There is deliberately no `net.unraid.docker.icon` here. Unraid does not expand [IP]/[PORT:n] when
# it fetches an icon, and a baked label cannot know the address of the machine serving it, so the
# label could only ever point at a host called "[IP]" and the tile would fall back to a question
# mark. The app does serve its own mark at /icons/icon-transparent-128.png; the Unraid template, or
# the container's Icon URL field, points at that address — see the Unraid section of the README.
#
# `managed=dockerman` is what makes dockerman (Unraid 7's Docker manager) show the tile and button
# for a container it did not create itself, so a plain `docker run` is covered. A Compose Manager
# stack should set `composeman` in its own labels, which overrides this one.
LABEL net.unraid.docker.managed="dockerman" \
      net.unraid.docker.webui="http://[IP]:[PORT:80]/"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
