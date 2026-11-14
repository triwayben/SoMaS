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

# Unraid builds its Docker tile from these labels: where the web UI lives, which icon it uses, and
# who manages the container. [IP] and [PORT:80] are filled in by Unraid from the host and the mapped
# port.
#
# The icon is a public https address rather than the app's own /icons/ URL, because Unraid downloads
# the picture itself, on the server, before it knows anything about the container's address — and it
# expands [IP]/[PORT:n] in the webui field but not in an icon it fetches. A baked `http://[IP]/...`
# therefore asks for a host literally called "[IP]" and leaves a question mark. This points at the
# committed artwork in this repository, so adding the container is the whole setup. The plate version
# is used because the mark's black outline would vanish on Unraid's dark dashboard.
#
# `managed=dockerman` is what makes dockerman (Unraid 7's Docker manager) show the tile and button
# for a container it did not create itself, so a plain `docker run` is covered. A Compose Manager
# stack should set `composeman` in its own labels, which overrides this one.
LABEL net.unraid.docker.managed="dockerman" \
      net.unraid.docker.webui="http://[IP]:[PORT:80]/" \
      net.unraid.docker.icon="https://raw.githubusercontent.com/triwayben/SoMaS/main/public/icons/icon-plate-128.png"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
