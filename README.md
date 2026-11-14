# SoMaS — a Sonos-style controller for Music Assistant

**SoMaS** is a web app that clones the Sonos controller experience — the current Sonos layout
(floating glass
player bubble with artwork, queue and group volume above a Home / System dock and round Search
button, full-screen Now Playing with artwork-tinted background) — on top of a **Music Assistant**
server. Rooms, groups, sources, inputs, queues, favorites, search and
per-room settings all come live from Music Assistant over its websocket API.

Nothing is proxied through a third-party server: the browser talks straight to your Music Assistant
host, and your token stays in this browser's `localStorage`.

## Run it

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Production build:

```bash
npm run build        # type-checks, then bundles to dist/
npm run preview
```

## On your phone (same Wi-Fi)

```bash
npm run lan          # build, then serve on 0.0.0.0:4173 - the one to use on the phone
npm run dev:lan      # dev server on 0.0.0.0:5173 with hot reload, for working on it
```

Open the Network address Vite prints (e.g. `http://192.168.1.20:4173/`) on the phone, and add
that exact address to the home screen once. Then just run `npm run lan` whenever you want the app:
the port never changes, so the phone keeps its server address, login and settings, and an app that
is already open reloads itself onto a new build the next time you bring it to the front.

The dev server is reachable by anyone on your network while it runs, so stop it when you are done.

Two things that look like "my changes aren't showing", and how to avoid them:

- **Don't switch ports or addresses.** Login and settings live in browser storage per origin, so
  `:4173` and `:5173` are separate apps with separate logins, and so is a different IP.
- **A home screen icon keeps a snapshot of the page it was created from.** If an icon shows an old
  version after a rebuild, delete it and add it again from the address above.

- On the phone, enter your **Music Assistant** address on the Connect screen using the server's LAN
  name or IP (e.g. `music-assistant.local:8095`, `192.168.1.20:8095`) — `localhost` there would mean
  the phone itself.
- Windows may ask to allow Node.js through the firewall the first time; allow it on private
  networks. If the phone cannot reach the page, that prompt was likely dismissed.

### Add to the home screen

The app ships a web app manifest (`public/manifest.webmanifest`) and icons, so it opens
full-screen without browser chrome once added:

- **iPhone / iPad:** share sheet → *Add to Home Screen* in Safari.
- **Android:** Chrome menu → *Add to Home screen* (a full app install prompt needs HTTPS; over plain
  `http://` on the LAN Chrome installs it as a shortcut instead).

The artwork lives in `assets/app-icon.png` (2048×2048, transparent), with `assets/logo.webp` kept as
the exported copy of the same mark for anything outside the app. Every icon in `public/icons/` is
generated from that master by `node scripts/make-icons.mjs`:

- `icon-128`, `icon-180`, `icon-192`, `icon-512` and `icon-maskable-512` — the mark on its dark tile,
  which is what the app, a home screen and Android's maskable slot use.
- `favicon-64` and `icon-circle-512` — the same, cut to a circle, for a tab or a round app icon.
- `icon-transparent-128` and `icon-transparent-512` — no tile behind the mark, for Unraid's Docker
  tile and any other dashboard that draws its own background. The mark keeps its own soft shadow,
  which disappears on a dark background but reads as a faint grey smudge on white — use the tile
  version there.

The generated PNGs are committed, so a normal build does not need to run it; replace the master and
rerun the script to change the app's icon everywhere.

## In a container

Every push to `main` builds an image and publishes it to GitHub Container Registry, so nothing has
to be installed on the machine that serves it:

```bash
docker pull ghcr.io/triwayben/somas:latest
docker run -d \
  --name somas \
  --restart unless-stopped \
  -p 8080:80 \
  ghcr.io/triwayben/somas:latest
```

The image is an nginx build of the static bundle and listens on **port 80**, so map whichever host
port you like — `8080` above, as `http://192.168.1.20:8080/`. Two tags are published: `latest` and
the full commit SHA, which is what to pin if you would rather upgrade deliberately. It is built for
**Linux amd64** only (the Actions runner's own platform); on a Raspberry Pi or other arm64 host,
build it locally with `docker build -t somas .` and run that.

The same thing as Compose, in a `docker-compose.yml` next to your other services:

```yaml
services:
  somas:
    image: ghcr.io/triwayben/somas:latest
    container_name: somas
    restart: unless-stopped
    ports:
      - "8080:80"
```

Things worth knowing about how it runs:

- **The container never talks to Music Assistant.** The browser does, directly — the address and
token are entered on the Connect screen and kept in that browser. So the phone or laptop running
SoMaS has to reach Music Assistant, not the container, and there is nothing to configure, no
volumes, no environment variables and no network mode.
- **Port 80 is the only thing it does**, so a reverse proxy or a different host port is all you
  need to pick. There is a built-in healthcheck that gets `/` from inside the container.
- **Updating** is `docker pull ghcr.io/triwayben/somas:latest` and then recreating the container
  (`docker compose up -d` does both). `index.html` and `config.json` are served no-cache while the
  hashed asset files are cached forever, so a reload after an update picks up the new build without
  a hard refresh.
- **Pre-filling the address** needs no rebuild: mount your own settings file over the shipped one
  with `-v /path/to/config.json:/usr/share/nginx/html/config.json:ro`, holding
  `{ "server": "music-assistant.local:8095" }`. `?server=host:port` on the URL also works.
- **`https://`** means terminating TLS in front of the container (reverse proxy), because nginx here
  serves plain HTTP. If the page is on HTTPS, Music Assistant must be too, or the browser blocks the
  websocket as mixed content.

## Guests without giving away the token

A guest phone should not be handed an admin token. `deploy/proxy` is a small service that sits in
front of Music Assistant: the guest's phone talks to the proxy with a **guest key**, the proxy
relays to Music Assistant with the real token, and the token never reaches the browser.

In plain words: your Music Assistant token is the master key, and the proxy is a doorman holding
it. A guest carries only a door key word. The doorman passes through what a guest needs — rooms,
playback, volume, grouping, queues, browsing, artwork — and refuses the rest with a readable
message. The code below carries the doorman's address and the key, so nobody types either.

### Setting it up

1. **Make a token in Music Assistant.** Sign in as the account the proxy should act as, then
   *Settings → Profile → Long-lived access tokens → Create*. Copy it now — Music Assistant shows it
   once. If you want the proxy to hold a guest's token rather than your own, create a user with the
   **Guest** role first (Settings → Users) and make the token while signed in as that user; the
   proxy's allowlist and Music Assistant's own role checks then agree with each other.
2. **Choose a guest key.** Any password you are happy for guests to type. It is not a Music
   Assistant credential — only the proxy knows it, and you can change it by restarting the proxy
   with a different `GUEST_KEY`.
3. **Run the proxy** somewhere that can reach Music Assistant, usually the same NAS:

```bash
docker build -t somas-proxy deploy/proxy
docker run -d \
  --name somas-proxy \
  --restart unless-stopped \
  -p 8090:8090 \
  -v somas-guest:/data \
  -e MA_URL=http://192.168.1.20:8095 \
  -e MA_TOKEN=paste-a-long-lived-token \
  -e GUEST_KEY=choose-a-guest-password \
  somas-proxy
```

Or as a second service beside the app:

```yaml
services:
  somas-proxy:
    build: ./deploy/proxy
    container_name: somas-proxy
    restart: unless-stopped
    ports:
      - "8090:8090"
    volumes:
      # Keeps a key replaced from SoMaS across restarts.
      - somas-guest:/data
    environment:
      MA_URL: "http://192.168.1.20:8095"
      MA_TOKEN: "paste-a-long-lived-token"
      GUEST_KEY: "choose-a-guest-password"
```

4. **Put the proxy's address into SoMaS once.** On your own phone open SoMaS → Settings →
   **Guests** and fill in the proxy's address with its port (`192.168.1.20:8090`, or whatever you
   published) and the guest key. They are remembered per server and per account, so this is a
   one-time job.
5. **Show the guest code.** Same section → **Show guest code**, and let the visitor scan it with
   their camera. SoMaS opens on their phone already signed in as a guest — no address, no key, no
   Connect screen — and lands on the room controls. It is a link, so it works pasted into a message
   too.
6. **Check it worked.** On the guest phone the room grid appears straight away, Settings is
   hidden, and the hearts and *Scan library* are gone. Everything a guest needs still works: rooms,
   playback, volume, grouping, queues, browsing, search and artwork.

If you would rather not use a code, the older way still works: open SoMaS, enter the **proxy's**
address and port on the Connect screen, and put the **guest key** in the token field — not the
Music Assistant address, and not the Music Assistant token.

The code is a link with the key inside it, so treat it like a house key: anyone who scans it can
control the rooms until that key is replaced.

### Changing the key later

Settings → **Guests** → **Replace key** makes a new key, tells the proxy to use it, and shows the
code that goes with it. Everyone holding an old code is out: the old key stops working, and any
guest session it opened is closed straight away rather than running to its natural end.

No shell needed for this. The app asks the proxy with your own Music Assistant login, and the proxy
checks with Music Assistant that the token really belongs to an admin before it changes anything —
a guest, or a token that has been revoked, gets a refusal. The proxy keeps the new key in
`/data/guest-key` inside its container, which is why the setup above mounts a volume there; without
one the change lasts until the proxy restarts, and the confirmation says so when that happens.
`GUEST_KEY` is only the starting key for a proxy that has never been given one from SoMaS.

What the proxy forwards, and what it does not:

- **Allowed:** `players/*`, `player_queues/*`, library reads under `music/*`, `providers` and
  `config/providers`, plus `/info` and `/imageproxy` for the banner and covers.
- **Refused**, with a readable error instead of a server rejection: `music/favorites/add_item`,
  `music/favorites/remove_item`, `music/sync`, `players/add_currently_playing_to_favorites`,
  everything outside the list above (`config/*`, user management), and any `auth/*` it does not
  answer itself.
- **Held back:** the real token, which only ever exists in the proxy's environment. A guest who
  opens the browser's network tab sees their own guest key and nothing else.

Worth knowing: the proxy is not a TLS terminator, so `MA_URL` must be `http://` (put a reverse proxy
in front if you need HTTPS); it opens one Music Assistant session per connected guest; and it has a
`/health` endpoint for container health checks. Settings, themes and layouts stay per server and per
account in the browser, so a guest's own changes do not touch yours.

When something does not work, the messages say which piece is wrong:

- **"That guest key is not right"** — the token field holds something other than the `GUEST_KEY`
  value, most often the Music Assistant token by mistake.
- **"Could not reach Music Assistant"** — the proxy cannot open a websocket to `MA_URL` from its own
  machine. `127.0.0.1` there means the proxy's own container, not your NAS: use the NAS address.
- **Page loads but there is no artwork or version** — the browser is reaching the proxy, but the
  proxy's `/imageproxy` and `/info` pass-through failed; check the proxy log for a 502.
- **Nothing connects at all** — the guest is still pointed at Music Assistant's port instead of the
  proxy's, or the page is on `https://` while the proxy only speaks `ws://`.

## Unraid

Unraid builds a container's Docker tile — the icon, and the **WebUI** button that opens the app —
from template fields or from `net.unraid.docker.*` labels, and a container has to be marked as
*managed* before it uses those labels at all. The image carries
`net.unraid.docker.managed=dockerman` and the webui link, so a container started with a plain
`docker run` gets its button on the Docker and Dashboard pages.

### The icon needs a real address

The image deliberately carries **no** `net.unraid.docker.icon` label. Unraid expands `[IP]` and
`[PORT:n]` in a template's *WebUI* field but not when it fetches an icon, so a baked
`http://[IP]:[PORT:80]/…` label asks a host literally called `[IP]` for a picture, gets nothing,
leaves the tile as a question mark, and caches that miss — which is why a force-update does not
bring it back. The app does serve its own mark; the address just has to be a real one.

SoMaS serves `http://<nas-ip>:<port>/icons/icon-transparent-128.png`, and your browser can reach
that, so point Unraid at it:

1. Docker tab → the container → **Edit** → **Icon URL**:
   `http://192.168.1.20:8080/icons/icon-transparent-128.png`, with your own address and host port.
2. **Apply**, so the container is recreated with that field.
3. Delete the cached copies, or Unraid keeps showing the old (missing) picture:
   `/var/lib/docker/unraid/images/<container>-icon.png` and
   `/var/local/emhttp/plugins/dynamix.docker.manager/images/<container>-icon.png`.
4. Reload the Docker tab.

The tile is small, so that file is 128px — the size it draws — with no background so the tile shows
through. `icon-transparent-512.png` is the same mark at full size, and `icon-128.png` is the
dark-tile version for anywhere a transparent mark would disappear.

If you would rather it work with no step at all, publish `public/icons/icon-transparent-128.png` at
a fixed public https URL (a gist or a one-file site) and use that in the icon label: a baked label
has to point somewhere reachable, and the address of your NAS is not knowable at build time.

A Compose Manager stack should say `managed=composeman` in its own labels, so Compose owns the
container rather than dockerman, and has to spell the icon out for the same reason:

```yaml
labels:
  net.unraid.docker.managed: composeman
  net.unraid.docker.webui: "http://192.168.1.20:8080/"
  net.unraid.docker.icon: "http://192.168.1.20:8080/icons/icon-transparent-128.png"
```

Unraid's Docker tile is small, so the labels point at `icon-transparent-128.png`: a 128px file, at
the size the tile draws, with no background of its own so the tile shows through. `icon-transparent-512.png`
is the same picture at full size if your template wants it, and `icon-128.png` is the dark-tile
version for anywhere a transparent mark would disappear.

`deploy/unraid/docker-compose.yml` is a ready copy — replace the address with your server's and use
whatever host port you mapped to container port 80. Both URLs must be reachable **from the Unraid
server itself**, so give a LAN address rather than `localhost`, and keep the container running:
the icon and page are served by SoMaS, not hosted elsewhere.

Two ways to set it, depending on how the container was created:

- **Docker Compose Manager:** Stack → Edit → the container's **Icon URL** and **WebUI URL** fields,
  or add the labels above to the stack's YAML. Unraid fills these in when the container is
  recreated, so a stack that already exists may need to be stopped and redeployed.
- **Add Container template:** copy `deploy/unraid/SoMaS.xml` to
  `/boot/config/plugins/dockerMan/templates-user/` on the server, then add the container from that
  template — its `<Icon>` and `<WebUI>` give you the mark and the button with no labels involved.

Unraid caches a container's icon after downloading it, so a changed icon needs the cached copies
removed before the Docker tab fetches it again:
`/var/lib/docker/unraid/images/<container>-icon.png` and
`/var/local/emhttp/plugins/dynamix.docker.manager/images/<container>-icon.png`.

## Connect

### Pre-filling the address

The Connect screen suggests a server so it does not have to be typed on every device:

- `public/config.json` holds a starting address, shipped as
  `{ "server": "music-assistant.local:8095" }`.
  Edit it at deploy time and every
  fresh visit to the app starts with that address filled in. It ships in `dist/` with the build.
- `?server=host:port` on the URL overrides it, handy for testing or a second server.
- A previously saved address always wins over both, so change it once in the field and the app
  remembers it on that device.

1. Open the app. Enter your Music Assistant address, e.g. `music-assistant.local:8095` or
   `192.168.1.20:8095` (add `https://` if your webserver uses TLS), or tap **Find my server** to
   search the network. The search tries the machine serving this page (usually the same NAS or Pi)
   and the usual local names, all on port 8095, by opening the same websocket the app would use —
   a browser cannot enumerate a LAN, so anything on a custom port or another machine still needs
   typing.
2. Paste a token: **Music Assistant → Settings → Profile → Long-lived access tokens → Create**.
   Alternatively switch to *username & password*, which uses `POST /auth/login`.
3. Hit **Connect**, or **Explore the demo system** to browse the full UI with a simulated
   eight-room system and library.

If the page is served over `https://` the browser will block a plain `ws://` connection, so use
HTTPS on both sides or serve this app over HTTP on your LAN.

## What is wired up

| Screen | Music Assistant calls |
| --- | --- |
| Home | `music/recently_played_items`, `music/favorites/library_items`, `music/recommendations`, `music/sources` |
| Search | `music/search` (songs, albums, artists, playlists, stations, podcasts) |
| Browse / library | `music/browse`, `music/<type>/library_items` |
| Album / playlist / artist | `music/albums/album_tracks`, `music/playlists/playlist_tracks`, `music/artists/artist_tracks`, `music/genres/tracks` |
| Now Playing | `player_queues/play_pause`, `next`, `previous`, `seek`, `shuffle`, `repeat` |
| Volume / mute | `players/cmd/volume_set`, `players/cmd/group_volume`, `players/cmd/volume_mute` |
| Grouping | `players/cmd/set_members` |
| Inputs | `players/cmd/select_source` |
| Room settings | `players/cmd/set_option`, `players/cmd/select_sound_mode`, `players/sleep_timer/set` |
| Queue | `player_queues/items`, `player_queues/play_index`, `player_queues/delete_item`, `player_queues/clear` |
| Play anything | `player_queues/play_media` (`play` / `next` / `add`) |
| Favorites | `music/favorites/add_item`, `music/favorites/remove_item` |

Live state is kept in sync from Music Assistant's push events (`player_updated`, `queue_updated`,
`queue_items_updated`, `provider_*`), with automatic reconnect and re-hydration.

## Design notes

- Mobile-first: the Sonos app layout, constrained to a phone-width column, presented as a rounded
  device frame on desktop.
- Dark and light themes (`System` follows the OS).
- The app asks the server who is signed in (`auth/me`) and what that role may do (`auth/scopes`),
  then hides controls that could only fail: a **guest** keeps full player, queue and room-settings
  control but loses the favourites hearts and *Scan library*, because both change the library.
  Servers too old to answer both commands leave everything visible. To try it, open the demo system
  with `?demoRole=guest`.
- Settings belong to a server *and* an account, not to the browser: service order, theme, pinned
  rooms, sort mode, search history and grouping presets are stored per Music Assistant instance and
  per login, so pointing SoMaS at a second server, or signing in as someone else on the same one,
  gives that account its own layout and switching back restores the first one's. Accounts are told
  apart by a short hash, never the token itself. The demo system keeps its own sandbox settings.
  **Move settings to another phone** shows one QR code that carries every server saved on the
  device; scanning it opens SoMaS on the other phone and offers to carry each layout onto its own
  server. The JSON text is still there behind *Show the text instead* for the rare case a camera
  cannot be used, and a single-server copy from an older build still pastes onto whatever is
  connected.
- Album art drives the Now Playing backdrop; artwork URLs are resolved through `/imageproxy`,
  retrying with the bearer token when a server requires authentication.
- Artwork falls back to deterministic generated covers, so the UI never shows broken images.
- Demo mode implements the same command interface as the real backend, so every screen and control
  is exercisable offline.

## Deliberate differences from the Sonos app

Sonos-only hardware features are not in Music Assistant's API surface, so they are not faked:
Trueplay tuning, alarms, Sonos Voice, account/billing, firmware updates, and per-speaker EQ
presets beyond the options the player provider exposes (`player.options`). Where Music Assistant
does expose an equivalent (crossfade, loudness, bass/treble, sound modes, sleep timer, inputs) it is
in Room settings.
