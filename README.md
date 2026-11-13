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

The artwork lives in `assets/app-icon.png` (2048×2048, transparent) and every icon in
`public/icons/` — 180/192/512, the maskable variant and the 64px favicon — is generated from it by
`node scripts/make-icons.mjs`. The generated PNGs are committed, so a normal build does not need to
run it; replace the master and rerun it to change the app's icon everywhere.

**Unraid:** the container serves the icons itself, so point the template's Icon URL at
`http://<your-nas>:8080/icons/icon-512.png` (or wherever you mapped port 80). No external hosting
needed, and it works while the container is running.
- The dev server is reachable by anyone on your network while it runs, so stop it when you are done.

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
   `192.168.1.20:8095` (add `https://` if your webserver uses TLS).
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
- Settings belong to a server, not to the browser: service order, theme, pinned rooms, sort mode,
  search history and grouping presets are stored per Music Assistant instance, so pointing SoMaS at
  a second server gives it its own layout and switching back restores the first one's. The demo
  system keeps its own sandbox settings.
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
