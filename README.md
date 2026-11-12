# Sonos-style controller for Music Assistant

A web app that clones the Sonos controller experience — the current Sonos layout (floating glass
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

## Connect

1. Open the app. Enter your Music Assistant address, e.g. `homeassistant.local:8095` or
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
