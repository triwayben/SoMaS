import { coverUrl } from "../lib/art";
import type {
  Backend,
  BrowseFolder,
  ConnState,
  MasEvent,
  MediaItem,
  MusicProvider,
  Player,
  PlayerQueue,
  QueueItem,
  RecommendationsFolder,
  ServerInfo,
} from "./types";

/**
 * A self-contained local simulation of a Music Assistant server.
 * It speaks the same command language as the real websocket API, so the UI code
 * path is identical — it just does not touch the network.
 */

const now = () => Date.now() / 1000;
const id = (prefix: string, value: string) =>
  `${prefix}--${value.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;

interface DemoTrack extends MediaItem {
  minutes: number;
}

function makeTrack(
  title: string,
  artist: string,
  album: string,
  minutes: number,
  index: number,
): DemoTrack {
  const albumSeed = `${artist}-${album}`;
  const uri = `demo://track/${id("t", `${album}-${title}-${index}`)}`;
  return {
    uri,
    name: title,
    media_type: "track",
    item_id: `${id("t", `${album}-${title}-${index}`)}`,
    provider: "library",
    duration: Math.round(minutes * 60),
    minutes,
    favorite: index === 1,
    image: {
      type: "thumb",
      path: coverUrl(albumSeed),
      provider: "builtin",
      remotely_accessible: true,
    },
    artists: [{ name: artist, uri: `demo://artist/${id("a", artist)}`, media_type: "artist" }],
    album: {
      uri: `demo://album/${id("al", albumSeed)}`,
      name: album,
      media_type: "album",
      artists: [{ name: artist }],
      image: { type: "thumb", path: coverUrl(albumSeed), remotely_accessible: true },
    },
    provider_mappings: [],
    index,
  } as DemoTrack;
}

const ALBUMS: Array<{ title: string; artist: string; year: number; tracks: string[] }> = [
  {
    title: "Neon Hours",
    artist: "Vela Grey",
    year: 2025,
    tracks: ["Midnight Arcade", "Neon Hours", "Paper Planes", "Silver Static"],
  },
  {
    title: "Slow Tide",
    artist: "Marlow",
    year: 2024,
    tracks: ["Slow Tide", "Saltwater", "Harbour Lights"],
  },
  {
    title: "Afterglow Avenue",
    artist: "Junip Park",
    year: 2025,
    tracks: ["Afterglow", "Corner Store", "Cassis", "Long Way Home"],
  },
  {
    title: "Sable",
    artist: "Sable & The Quiet",
    year: 2023,
    tracks: ["Sable", "Bone China", "Winter Garden"],
  },
  {
    title: "Kite Season",
    artist: "Kite Season",
    year: 2025,
    tracks: ["Updraft", "Field Notes", "Blue Rope", "Open Sky"],
  },
  {
    title: "North of Here",
    artist: "Norr",
    year: 2024,
    tracks: ["Fjord", "North of Here", "Low Sun", "Pine"],
  },
  {
    title: "Delta Bloom",
    artist: "Rosa Vega",
    year: 2025,
    tracks: ["Bloom", "Cassia", "Heatwave", "Violet Hour"],
  },
  {
    title: "Halcyon",
    artist: "The Slow Coast",
    year: 2022,
    tracks: ["Halcyon", "Driftwood", "Golden Hour"],
  },
  {
    title: "Blue Monday Club",
    artist: "Ivy Lane",
    year: 2024,
    tracks: ["Blue Monday", "Telephone", "Ferris Wheel"],
  },
  {
    title: "Interior Weather",
    artist: "Delta Bloom",
    year: 2025,
    tracks: ["Interior Weather", "Glasshouse", "Soft Focus"],
  },
  {
    title: "Night Bus",
    artist: "Halcyon Days",
    year: 2023,
    tracks: ["Night Bus", "Terminal 2", "Last Train"],
  },
  {
    title: "Warm Static",
    artist: "Vela Grey",
    year: 2026,
    tracks: ["Warm Static", "Analog Heart", "Repeat", "Daylight Saving"],
  },
];

const TRACKS: DemoTrack[] = ALBUMS.flatMap((album, albumIndex) =>
  album.tracks.map((title, index) =>
    makeTrack(title, album.artist, album.title, 2.6 + ((index * 37 + albumIndex * 11) % 180) / 60, index),
  ),
);

const ALBUM_ITEMS: MediaItem[] = ALBUMS.map((album) => ({
  uri: `demo://album/${id("al", `${album.artist}-${album.title}`)}`,
  name: album.title,
  media_type: "album",
  item_id: id("al", `${album.artist}-${album.title}`),
  provider: "library",
  year: album.year,
  favorite: album.title === "Neon Hours" || album.title === "Halcyon",
  artists: [
    { name: album.artist, uri: `demo://artist/${id("a", album.artist)}`, media_type: "artist" },
  ],
  image: {
    type: "thumb",
    path: coverUrl(`${album.artist}-${album.title}`),
    provider: "builtin",
    remotely_accessible: true,
  },
  duration: 2400,
  provider_mappings: [],
}));

const ARTIST_NAMES = [...new Set(ALBUMS.map((album) => album.artist))];
const ARTIST_ITEMS: MediaItem[] = ARTIST_NAMES.map((name) => ({
  uri: `demo://artist/${id("a", name)}`,
  name,
  media_type: "artist",
  item_id: id("a", name),
  provider: "library",
  favorite: name === "Vela Grey",
  image: {
    type: "thumb",
    path: coverUrl(`artist-${name}`),
    provider: "builtin",
    remotely_accessible: true,
  },
  provider_mappings: [],
}));

const PLAYLIST_NAMES = [
  "Sunday Morning",
  "Focus Deep",
  "Dinner Party",
  "Late Night Drive",
  "Rainy Day Jazz",
  "Vinyl Favourites",
  "Acoustic Chill",
  "New Releases",
  "Kitchen Radio",
  "Golden Hour",
];

const PLAYLIST_ITEMS: MediaItem[] = PLAYLIST_NAMES.map((name) => ({
  uri: `demo://playlist/${id("p", name)}`,
  name,
  media_type: "playlist",
  item_id: id("p", name),
  provider: "library",
  favorite: name === "Sunday Morning",
  image: {
    type: "thumb",
    path: coverUrl(`playlist-${name}`),
    provider: "builtin",
    remotely_accessible: true,
  },
  provider_mappings: [],
}));

const RADIO_NAMES = [
  "BBC Radio 6 Music",
  "KEXP 90.3",
  "NTS Radio 1",
  "Radio Paradise",
  "SomaFM Groove Salad",
  "Triple J",
  "FIP",
  "World Cafe",
];

const RADIO_ITEMS: MediaItem[] = RADIO_NAMES.map((name) => ({
  uri: `demo://radio/${id("r", name)}`,
  name,
  media_type: "radio",
  item_id: id("r", name),
  provider: "radio_browser--demo",
  image: {
    type: "thumb",
    path: coverUrl(`radio-${name}`),
    provider: "builtin",
    remotely_accessible: true,
  },
  provider_mappings: [],
}));

const GENRE_NAMES = ["Jazz", "Electronic", "Indie", "Hip-Hop", "Classical", "Ambient", "Rock", "Soul"];
const GENRE_ITEMS: MediaItem[] = GENRE_NAMES.map((name) => ({
  uri: `demo://genre/${id("g", name)}`,
  name,
  media_type: "genre",
  item_id: id("g", name),
  provider: "library",
  image: {
    type: "thumb",
    path: coverUrl(`genre-${name}`),
    provider: "builtin",
    remotely_accessible: true,
  },
  provider_mappings: [],
}));

const PODCAST_NAMES = ["Song Exploder", "99% Invisible", "Hard Fork", "The Daily", "Acquired"];
const PODCAST_ITEMS: MediaItem[] = PODCAST_NAMES.map((name) => ({
  uri: `demo://podcast/${id("pc", name)}`,
  name,
  media_type: "podcast",
  item_id: id("pc", name),
  provider: "podcasts--demo",
  image: {
    type: "thumb",
    path: coverUrl(`podcast-${name}`),
    provider: "builtin",
    remotely_accessible: true,
  },
  provider_mappings: [],
}));

const AUDIOBOOK_NAMES = ["Project Hail Mary", "Dune", "The Hobbit", "Piranesi"];
const AUDIOBOOK_ITEMS: MediaItem[] = AUDIOBOOK_NAMES.map((name) => ({
  uri: `demo://audiobook/${id("ab", name)}`,
  name,
  media_type: "audiobook",
  item_id: id("ab", name),
  provider: "audiobooks--demo",
  image: {
    type: "thumb",
    path: coverUrl(`audiobook-${name}`),
    provider: "builtin",
    remotely_accessible: true,
  },
  provider_mappings: [],
}));

const PROVIDERS: MusicProvider[] = [
  {
    instance_id: "spotify--demo",
    domain: "spotify",
    name: "Spotify",
    type: "music",
    available: true,
    is_streaming_provider: true,
  },
  {
    instance_id: "apple_music--demo",
    domain: "apple_music",
    name: "Apple Music",
    type: "music",
    available: true,
    is_streaming_provider: true,
  },
  {
    instance_id: "tidal--demo",
    domain: "tidal",
    name: "Tidal",
    type: "music",
    available: true,
  },
  {
    instance_id: "library",
    domain: "builtin",
    name: "Library",
    type: "music",
    available: true,
  },
  {
    instance_id: "filesystem--demo",
    domain: "filesystem",
    name: "Local Files",
    type: "music",
    available: true,
  },
  {
    instance_id: "radio_browser--demo",
    domain: "radio_browser",
    name: "Radio Browser",
    type: "music",
    available: true,
  },
  {
    instance_id: "podcasts--demo",
    domain: "podcastfeed",
    name: "Podcasts",
    type: "music",
    available: true,
  },
  {
    instance_id: "audiobooks--demo",
    domain: "audiobookshelf",
    name: "Audiobookshelf",
    type: "music",
    available: false,
  },
  {
    instance_id: "sonos--demo",
    domain: "sonos",
    name: "Sonos",
    type: "player",
    available: true,
  },
  {
    instance_id: "chromecast--demo",
    domain: "chromecast",
    name: "Chromecast",
    type: "player",
    available: true,
  },
];

const svgIcon = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`,
  )}`;

const PROVIDER_ICONS: Record<string, string> = {
  spotify: svgIcon(
    '<rect width="24" height="24" fill="#1ed760"/><g fill="none" stroke="#08160d" stroke-linecap="round"><path d="M6.1 8.7c4-1.1 8.2-.7 11.5 1.1" stroke-width="1.9"/><path d="M6.7 12.2c3.3-.9 6.8-.6 9.7 1" stroke-width="1.7"/><path d="M7.4 15.5c2.5-.7 5.2-.4 7.4.8" stroke-width="1.5"/></g>',
  ),
  apple_music: svgIcon(
    '<defs><linearGradient id="am" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fa2d48"/><stop offset="1" stop-color="#9a4bff"/></linearGradient></defs><rect width="24" height="24" fill="url(#am)"/><path d="M16.4 5.1v8.5a2.7 2.7 0 1 1-1.3-2.3V8l-4.6 1v5.6a2.7 2.7 0 1 1-1.3-2.3V6.8z" fill="#fff"/>',
  ),
  tidal: svgIcon(
    '<rect width="24" height="24" fill="#05070a"/><path d="M7.4 6.2 11.2 10 7.4 13.8 3.6 10z" fill="#fff"/><path d="M12.8 10 16.6 6.2 20.4 10 16.6 13.8z" fill="#fff"/>',
  ),
  builtin: svgIcon(
    '<rect width="24" height="24" fill="#2f3237"/><g fill="#fff"><rect x="5" y="6.4" width="2.2" height="11.2" rx="1.1"/><rect x="9" y="4.8" width="2.2" height="12.8" rx="1.1"/><rect x="13" y="7.2" width="2.2" height="10.4" rx="1.1"/><rect x="17" y="5.8" width="2.2" height="11.8" rx="1.1"/></g>',
  ),
  filesystem: svgIcon(
    '<rect width="24" height="24" fill="#3a3e45"/><path d="M5.2 8.3a1.7 1.7 0 0 1 1.7-1.7h2.8l1.7 2.1h6.4a1.7 1.7 0 0 1 1.7 1.7v6.8a1.7 1.7 0 0 1-1.7 1.7H6.9a1.7 1.7 0 0 1-1.7-1.7z" fill="none" stroke="#f2f4f7" stroke-width="1.7"/>',
  ),
  radio_browser: svgIcon(
    '<rect width="24" height="24" fill="#0f3d2f"/><circle cx="12" cy="12" r="2.1" fill="#56e39f"/><g fill="none" stroke="#56e39f" stroke-width="1.7" stroke-linecap="round"><path d="M7.6 7.6a6.2 6.2 0 0 0 0 8.8"/><path d="M16.4 7.6a6.2 6.2 0 0 1 0 8.8"/></g>',
  ),
  podcastfeed: svgIcon(
    '<rect width="24" height="24" fill="#7b3fe4"/><g fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"><rect x="9.7" y="4.7" width="4.6" height="8" rx="2.3"/><path d="M7.2 11.3a4.8 4.8 0 0 0 9.6 0"/><path d="M12 16.1v3.2"/></g>',
  ),
  audiobookshelf: svgIcon(
    '<rect width="24" height="24" fill="#b45309"/><path d="M12 7.6c-1.6-1-3.6-1.4-5.6-1.4v10.2c2 0 4 .4 5.6 1.4 1.6-1 3.6-1.4 5.6-1.4V6.2c-2 0-4 .4-5.6 1.4z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>',
  ),
};

interface DemoSpeaker {
  key: string;
  name: string;
  model: string;
  volume: number;
  state: "playing" | "paused" | "idle";
  group: string[];
  source?: string;
}

const SPEAKERS: DemoSpeaker[] = [
  {
    key: "living_room",
    name: "Living Room",
    model: "Sonos Arc",
    volume: 34,
    state: "playing",
    group: ["living_room", "kitchen"],
    source: "Music Assistant",
  },
  { key: "kitchen", name: "Kitchen", model: "Sonos Era 100", volume: 22, state: "playing", group: [], source: "Music Assistant" },
  { key: "office", name: "Office", model: "Sonos Era 300", volume: 41, state: "paused", group: [], source: "Music Assistant" },
  { key: "bedroom", name: "Bedroom", model: "Sonos One SL", volume: 18, state: "idle", group: [], source: "TV" },
  { key: "patio", name: "Patio", model: "Sonos Move 2", volume: 55, state: "playing", group: ["patio", "garage"], source: "Bluetooth" },
  { key: "bathroom", name: "Bathroom", model: "Sonos One", volume: 12, state: "idle", group: [], source: "Music Assistant" },
  { key: "garage", name: "Garage", model: "Sonos Amp", volume: 48, state: "playing", group: [], source: "Music Assistant" },
  { key: "den", name: "Den", model: "Sonos Playbar", volume: 29, state: "paused", group: [], source: "TV" },
];

const STORED_QUEUE = [
  TRACKS[0],
  TRACKS[1],
  TRACKS[2],
  TRACKS[4],
  TRACKS[8],
  TRACKS[13],
  TRACKS[17],
  TRACKS[22],
  TRACKS[25],
  TRACKS[30],
  TRACKS[35],
  TRACKS[40],
];

function queueItemFor(track: DemoTrack, queueId: string, index: number): QueueItem {
  return {
    queue_id: queueId,
    queue_item_id: `qi-${queueId}-${index}`,
    name: track.name,
    duration: track.duration ?? 200,
    media_item: track,
    index,
  };
}

export function createDemoBackend(): Backend {
  const stateSubs = new Set<(state: ConnState, detail?: string) => void>();
  const eventSubs = new Set<(event: MasEvent) => void>();

  const players = new Map<string, Player>();
  const queues = new Map<string, PlayerQueue>();
  const queueItems = new Map<string, QueueItem[]>();

  let currentTrackIndex = 0;
  let elapsed = 42;

  for (const speaker of SPEAKERS) {
    players.set(speaker.key, {
      player_id: speaker.key,
      provider: speaker.model.includes("Cast") ? "chromecast--demo" : "sonos--demo",
      type: "player",
      name: speaker.name,
      available: true,
      device_info: {
        model: speaker.model,
        manufacturer: speaker.model.startsWith("Sonos") ? "Sonos" : "Google",
        software_version: "17.1",
        ip_address: "192.168.1.20",
      },
      supported_features: [
        "play_pause",
        "volume_set",
        "volume_mute",
        "next_previous",
        "seek",
        "grouping",
      ],
      playback_state: speaker.state,
      elapsed_time: elapsed,
      elapsed_time_last_updated: now(),
      volume_level: speaker.volume,
      volume_muted: false,
      group_members: speaker.group,
      can_group_with: SPEAKERS.map((s) => s.key).filter((k) => k !== speaker.key),
      active_source: speaker.source === "Music Assistant" ? speaker.key : "tv",
      source_list: [
        { id: "tv", name: "TV", passive: false },
        { id: "bluetooth", name: "Bluetooth", passive: false },
        { id: "line_in", name: "Line-in", passive: false },
        { id: "airplay", name: "AirPlay", passive: false },
      ],
      options: [
        { key: "crossfade", name: "Crossfade", type: "boolean", value: true },
        { key: "loudness", name: "Loudness", type: "boolean", value: false },
        {
          key: "bass",
          name: "Bass",
          type: "integer",
          value: 0,
          min_value: -10,
          max_value: 10,
          step: 1,
        },
        {
          key: "treble",
          name: "Treble",
          type: "integer",
          value: 2,
          min_value: -10,
          max_value: 10,
          step: 1,
        },
      ],
      sound_mode_list: [
        { id: "music", name: "Music" },
        { id: "movie", name: "Movie" },
        { id: "night", name: "Night Sound" },
      ],
      active_sound_mode: "music",
      current_media:
        speaker.state === "idle"
          ? null
          : {
              uri: TRACKS[0].uri,
              media_type: "track",
              title: TRACKS[currentTrackIndex].name,
              artist: (TRACKS[currentTrackIndex].artists?.[0]?.name as string) ?? "",
              album: TRACKS[currentTrackIndex].album?.name ?? "",
              image_url: TRACKS[currentTrackIndex].image?.path ?? null,
              duration: TRACKS[currentTrackIndex].duration ?? 200,
            },
    });
  }

  // Kitchen and Garage are synced to a group leader, like a real Sonos pair.
  const kitchen = players.get("kitchen");
  if (kitchen) {
    kitchen.synced_to = "living_room";
    kitchen.active_group = "living_room";
    kitchen.active_source = "living_room";
    kitchen.playback_state = "playing";
  }
  const garage = players.get("garage");
  if (garage) {
    garage.synced_to = "patio";
    garage.active_group = "patio";
    garage.active_source = "patio";
    garage.playback_state = "playing";
  }

  for (const speaker of SPEAKERS) {
    const queueId = speaker.group.length ? speaker.group[0] : speaker.key;
    if (queues.has(queueId) && queueId !== speaker.key) continue;
    const items = STORED_QUEUE.map((track, index) => queueItemFor(track, queueId, index));
    queueItems.set(queueId, items);
    const isActivePair = speaker.key === "living_room" || speaker.key === "kitchen";
    const startIndex = isActivePair
      ? 0
      : (SPEAKERS.findIndex((entry) => entry.key === speaker.key) * 5) % items.length;
    queues.set(queueId, {
      queue_id: queueId,
      active: isActivePair || speaker.key === "patio",
      display_name: speaker.name,
      available: true,
      items: items.length,
      shuffle_enabled: speaker.key === "patio",
      repeat_mode: "off",
      current_index: startIndex,
      elapsed_time: elapsed,
      elapsed_time_last_updated: now(),
      playback_speed: 1,
      state: speaker.state,
      current_item: items[startIndex],
      next_item: items[(startIndex + 1) % items.length],
      autoplay_enabled: true,
      sources: [PLAYLIST_ITEMS[0]],
    });
  }

  // Keep the queue ids unique per player, so every room has its own queue object.
  for (const speaker of SPEAKERS) {
    if (queues.has(speaker.key)) continue;
    const items = STORED_QUEUE.map((track, index) => queueItemFor(track, speaker.key, index));
    queueItems.set(speaker.key, items);
    const startIndex =
      (SPEAKERS.findIndex((entry) => entry.key === speaker.key) * 3 + 2) % items.length;
    queues.set(speaker.key, {
      queue_id: speaker.key,
      active: false,
      display_name: speaker.name,
      available: true,
      items: items.length,
      current_index: startIndex,
      elapsed_time: 30,
      elapsed_time_last_updated: now(),
      state: "idle",
      current_item: items[startIndex],
      next_item: items[(startIndex + 1) % items.length],
      sources: [],
    });
  }

  // Keep each room's now-playing metadata in step with its queue.
  for (const player of players.values()) {
    const queue = queues.get(player.active_source ?? "") ?? queues.get(player.player_id);
    const current = queue?.current_item;
    const track = current?.media_item;
    if (!track || player.playback_state === "idle") continue;
    player.current_media = {
      uri: track.uri,
      media_type: "track",
      title: track.name,
      artist: track.artists?.[0]?.name ?? null,
      album: track.album?.name ?? null,
      image_url: track.image?.path ?? null,
      duration: track.duration ?? null,
    };
  }

  const emit = (event: MasEvent) => {
    for (const cb of eventSubs) cb(event);
  };

  const emitPlayer = (playerId: string) => {
    emit({ event: "player_updated", object_id: playerId, data: players.get(playerId) });
  };

  const emitQueue = (queueId: string) => {
    emit({ event: "queue_updated", object_id: queueId, data: queues.get(queueId) });
  };

  const queueFor = (queueId: string) => {
    const queue = queues.get(queueId);
    if (!queue) throw new Error(`Unknown queue ${queueId}`);
    return queue;
  };

  const advance = (queueId: string) => {
    const queue = queueFor(queueId);
    const items = queueItems.get(queueId) ?? [];
    const nextIndex = ((queue.current_index ?? 0) + 1) % Math.max(items.length, 1);
    queue.current_index = nextIndex;
    queue.current_item = items[nextIndex];
    queue.next_item = items[(nextIndex + 1) % items.length];
    queue.elapsed_time = 0;
    queue.elapsed_time_last_updated = now();
    queue.state = "playing";
    emitQueue(queueId);
  };

  const timer = window.setInterval(() => {
    for (const queue of queues.values()) {
      if (queue.state !== "playing") continue;
      const duration = queue.current_item?.duration ?? 240;
      queue.elapsed_time = (queue.elapsed_time ?? 0) + 1;
      if (queue.elapsed_time >= duration) {
        advance(queue.queue_id);
        continue;
      }
      emitQueue(queue.queue_id);
    }
    for (const player of players.values()) {
      if (player.playback_state === "playing") {
        emitPlayer(player.player_id);
      }
    }
  }, 1000);

  const libraryList =
    (items: MediaItem[]) =>
    (args: Record<string, any>): MediaItem[] => {
      let list = [...items];
      if (args.favorite) list = list.filter((item) => item.favorite);
      if (typeof args.limit === "number" && args.limit > 0) list = list.slice(0, args.limit);
      return list;
    };

  const commands: Record<string, (args: Record<string, any>) => unknown> = {
    auth: () => ({ authenticated: true, user: "demo" }),
    "players/all": () => [...players.values()],
    "players/get_by_name": (args) =>
      [...players.values()].find((p) => p.name.toLowerCase() === String(args.name).toLowerCase()),
    "player_queues/all": () => [...queues.values()],
    "music/sources": () => PROVIDERS,
    "providers/icon": (args) =>
      PROVIDER_ICONS[String(args.provider).split("--")[0]] ?? null,
    "config/providers": () => PROVIDERS,
    "music/sync": () => null,
    "music/recently_played_items": (args) => {
      const history: MediaItem[] = [
        ALBUM_ITEMS[0],
        ...TRACKS.slice(0, 3),
        PLAYLIST_ITEMS[0],
        ...TRACKS.slice(3, 6),
        ALBUM_ITEMS[5],
        ...TRACKS.slice(6, 10),
        RADIO_ITEMS[1],
        ...TRACKS.slice(10, 14),
        PLAYLIST_ITEMS[3],
        ...TRACKS.slice(14, 18),
        ALBUM_ITEMS[8],
        ...TRACKS.slice(18, 24),
        ARTIST_ITEMS[0],
        ALBUM_ITEMS[3],
      ];
      const types = Array.isArray(args.media_types) ? (args.media_types as string[]) : null;
      let list = types
        ? history.filter((item) => item.media_type && types.includes(item.media_type))
        : history;
      if (typeof args.limit === "number" && args.limit > 0) list = list.slice(0, args.limit);
      return list;
    },
    "music/in_progress_items": () => [AUDIOBOOK_ITEMS[0], PODCAST_ITEMS[0]],
    "music/favorites/library_items": () => [
      ALBUM_ITEMS[0],
      ARTIST_ITEMS[0],
      PLAYLIST_ITEMS[0],
      ALBUM_ITEMS[7],
      RADIO_ITEMS[2],
      TRACKS[2],
      ALBUM_ITEMS[10],
    ],
    "music/albums/library_items": libraryList(ALBUM_ITEMS),
    "music/artists/library_items": libraryList(ARTIST_ITEMS),
    "music/playlists/library_items": libraryList(PLAYLIST_ITEMS),
    "music/tracks/library_items": libraryList(TRACKS),
    "music/radios/library_items": libraryList(RADIO_ITEMS),
    "music/genres/library_items": () => GENRE_ITEMS,
    "music/podcasts/library_items": () => PODCAST_ITEMS,
    "music/audiobooks/library_items": () => AUDIOBOOK_ITEMS,
    "music/recommendations": () => [
      {
        item_id: "recent",
        name: "Your mixes",
        provider: "library",
        items: [ALBUM_ITEMS[0], PLAYLIST_ITEMS[1], ALBUM_ITEMS[4], ALBUM_ITEMS[7], RADIO_ITEMS[0]],
      },
      {
        item_id: "spotify-mix",
        name: "Made for you",
        provider: "spotify--demo",
        items: [ALBUM_ITEMS[2], ALBUM_ITEMS[6], PLAYLIST_ITEMS[2], ALBUM_ITEMS[9]],
      },
    ] as RecommendationsFolder[],
    "music/recommendations/items": (args) => {
      if (args.item_id === "spotify-mix") return [ALBUM_ITEMS[6], PLAYLIST_ITEMS[2]];
      return [ALBUM_ITEMS[0], PLAYLIST_ITEMS[1]];
    },
    "music/item_by_uri": (args) =>
      [...ALBUM_ITEMS, ...TRACKS, ...PLAYLIST_ITEMS].find((item) => item.uri === args.uri) ?? null,
    "music/browse": (args) => {
      const path = String(args.path ?? "");
      if (path.startsWith("spotify") || path.startsWith("apple") || path.startsWith("tidal")) {
        return [
          { name: "Made For You", path: `${path}/made-for-you`, media_type: "folder" },
          { name: "Recently Played", path: `${path}/recent`, media_type: "folder" },
          { name: "New Releases", path: `${path}/new`, media_type: "folder" },
          { name: "Your Library", path: `${path}/library`, media_type: "folder" },
          ...PLAYLIST_ITEMS.slice(0, 4),
        ] as Array<MediaItem | BrowseFolder>;
      }
      if (path.endsWith("made-for-you")) return PLAYLIST_ITEMS.slice(0, 5);
      if (path.endsWith("recent")) return ALBUM_ITEMS.slice(0, 6);
      if (path.endsWith("new")) return ALBUM_ITEMS.slice(6);
      if (path.includes("radio")) return RADIO_ITEMS;
      if (path.includes("podcast")) return PODCAST_ITEMS;
      if (path.includes("audiobook")) return AUDIOBOOK_ITEMS;
      return [
        ...PLAYLIST_ITEMS.slice(0, 5),
        ...ALBUM_ITEMS.slice(0, 5),
      ] as Array<MediaItem | BrowseFolder>;
    },
    "music/search": (args) => {
      const query = String(args.search_query ?? "").toLowerCase().trim();
      if (!query) return { albums: [], artists: [], tracks: [], playlists: [], radios: [] };
      const match = (name: string) => name.toLowerCase().includes(query);
      return {
        albums: ALBUM_ITEMS.filter((item) => match(item.name)),
        artists: ARTIST_ITEMS.filter((item) => match(item.name)),
        tracks: TRACKS.filter((item) => match(item.name)),
        playlists: PLAYLIST_ITEMS.filter((item) => match(item.name)),
        radios: RADIO_ITEMS.filter((item) => match(item.name)),
        podcasts: PODCAST_ITEMS.filter((item) => match(item.name)),
      };
    },
    "music/albums/album_tracks": (args) => {
      const album = ALBUM_ITEMS.find((item) => item.item_id === args.item_id);
      if (!album) return [];
      return TRACKS.filter((track) => track.album?.name === album.name);
    },
    "music/playlists/playlist_tracks": () => STORED_QUEUE,
    "music/artists/artist_tracks": () => TRACKS.slice(0, 10),
    "music/favorites/add_item": () => null,
    "music/favorites/remove_item": () => null,
    "player_queues/items": (args) => queueItems.get(String(args.queue_id)) ?? [],
    "player_queues/play": (args) => {
      const queue = queueFor(String(args.queue_id));
      queue.state = "playing";
      queue.elapsed_time_last_updated = now();
      emitQueue(queue.queue_id);
      return null;
    },
    "player_queues/pause": (args) => {
      const queue = queueFor(String(args.queue_id));
      queue.state = "paused";
      queue.elapsed_time_last_updated = now();
      emitQueue(queue.queue_id);
      return null;
    },
    "player_queues/play_pause": (args) => {
      const queue = queueFor(String(args.queue_id));
      queue.state = queue.state === "playing" ? "paused" : "playing";
      queue.elapsed_time_last_updated = now();
      emitQueue(queue.queue_id);
      return null;
    },
    "player_queues/next": (args) => {
      advance(String(args.queue_id));
      return null;
    },
    "player_queues/previous": (args) => {
      const queue = queueFor(String(args.queue_id));
      const items = queueItems.get(queue.queue_id) ?? [];
      const index = Math.max((queue.current_index ?? 0) - 1, 0);
      queue.current_index = index;
      queue.current_item = items[index];
      queue.elapsed_time = 0;
      queue.elapsed_time_last_updated = now();
      emitQueue(queue.queue_id);
      return null;
    },
    "player_queues/seek": (args) => {
      const queue = queueFor(String(args.queue_id));
      queue.elapsed_time = Number(args.position) || 0;
      queue.elapsed_time_last_updated = now();
      emitQueue(queue.queue_id);
      return null;
    },
    "player_queues/shuffle": (args) => {
      const queue = queueFor(String(args.queue_id));
      queue.shuffle_enabled = Boolean(args.shuffle_enabled);
      emitQueue(queue.queue_id);
      return null;
    },
    "player_queues/repeat": (args) => {
      const queue = queueFor(String(args.queue_id));
      queue.repeat_mode = args.repeat_mode;
      emitQueue(queue.queue_id);
      return null;
    },
    "player_queues/play_index": (args) => {
      const queue = queueFor(String(args.queue_id));
      const items = queueItems.get(queue.queue_id) ?? [];
      const index = Number(args.index) || 0;
      queue.current_index = index;
      queue.current_item = items[index];
      queue.elapsed_time = 0;
      queue.elapsed_time_last_updated = now();
      queue.state = "playing";
      emitQueue(queue.queue_id);
      return null;
    },
    "player_queues/delete_item": (args) => {
      const queueId = String(args.queue_id);
      const items = queueItems.get(queueId) ?? [];
      const next = items.filter((item) => item.queue_item_id !== args.item_id_or_index);
      queueItems.set(queueId, next);
      const queue = queueFor(queueId);
      queue.items = next.length;
      emitQueue(queueId);
      return null;
    },
    "player_queues/clear": (args) => {
      const queueId = String(args.queue_id);
      queueItems.set(queueId, []);
      const queue = queueFor(queueId);
      queue.items = 0;
      queue.current_item = null;
      queue.state = "idle";
      emitQueue(queueId);
      return null;
    },
    "player_queues/play_media": (args) => {
      const queueId = String(args.queue_id);
      const media = Array.isArray(args.media) ? args.media : [args.media];
      const first = media[0] as string;
      const found = [...TRACKS, ...ALBUM_ITEMS, ...PLAYLIST_ITEMS].find(
        (item) => item.uri === first,
      );
      let tracks: DemoTrack[] = STORED_QUEUE;
      if (found?.media_type === "album") {
        tracks = TRACKS.filter((track) => track.album?.name === found.name);
      } else if (found?.media_type === "track") {
        tracks = TRACKS.filter((track) => track.uri !== found.uri);
        tracks.unshift(found as DemoTrack);
      } else if (found?.media_type === "playlist" || found?.media_type === "radio") {
        tracks = [...STORED_QUEUE].reverse();
      }
      const queue = queueFor(queueId);
      if (args.option === "add" || args.option === "next") {
        const existing = queueItems.get(queueId) ?? [];
        const extra = tracks.map((track, index) =>
          queueItemFor(track, queueId, existing.length + index),
        );
        queueItems.set(queueId, [...existing, ...extra]);
        queue.items = (queue.items ?? 0) + extra.length;
        emitQueue(queueId);
        return null;
      }
      const items = tracks.map((track, index) => queueItemFor(track, queueId, index));
      queueItems.set(queueId, items);
      queue.items = items.length;
      queue.current_index = 0;
      queue.current_item = items[0];
      queue.next_item = items[1];
      queue.elapsed_time = 0;
      queue.elapsed_time_last_updated = now();
      queue.state = "playing";
      queue.sources = found ? [found] : [];
      emitQueue(queueId);
      emit({ event: "queue_items_updated", object_id: queueId, data: null });
      return null;
    },
    "players/cmd/volume_set": (args) => {
      const player = players.get(String(args.player_id));
      if (player) {
        player.volume_level = Number(args.volume_level);
        emitPlayer(player.player_id);
      }
      return null;
    },
    "players/cmd/group_volume": (args) => {
      const player = players.get(String(args.player_id));
      if (player) {
        player.group_volume = Number(args.volume_level);
        for (const memberId of player.group_members ?? []) {
          const member = players.get(memberId);
          if (member) {
            member.volume_level = Number(args.volume_level);
            emitPlayer(member.player_id);
          }
        }
        emitPlayer(player.player_id);
      }
      return null;
    },
    "players/cmd/volume_mute": (args) => {
      const player = players.get(String(args.player_id));
      if (player) {
        player.volume_muted = Boolean(args.muted);
        emitPlayer(player.player_id);
      }
      return null;
    },
    "players/cmd/play_pause": (args) => {
      const playerId = String(args.player_id);
      const player = players.get(playerId);
      if (player) {
        player.playback_state = player.playback_state === "playing" ? "paused" : "playing";
        emitPlayer(playerId);
      }
      const queue = queues.get(playerId) ?? queues.get(String(player?.active_source));
      if (queue) {
        queue.state = queue.state === "playing" ? "paused" : "playing";
        queue.elapsed_time_last_updated = now();
        emitQueue(queue.queue_id);
      }
      return null;
    },
    "players/cmd/select_source": (args) => {
      const player = players.get(String(args.player_id));
      if (player) {
        player.active_source = String(args.source);
        emitPlayer(player.player_id);
      }
      return null;
    },
    "players/cmd/set_members": (args) => {
      const target = players.get(String(args.target_player));
      if (!target) return null;
      const add = (args.player_ids_to_add as string[]) ?? [];
      const remove = (args.player_ids_to_remove as string[]) ?? [];
      const members = new Set(target.group_members ?? []);
      for (const memberId of add) {
        members.add(memberId);
        const child = players.get(memberId);
        if (child) {
          child.synced_to = target.player_id;
          child.active_group = target.player_id;
          child.playback_state = target.playback_state;
          emitPlayer(child.player_id);
        }
      }
      for (const memberId of remove) {
        members.delete(memberId);
        const child = players.get(memberId);
        if (child) {
          child.synced_to = null;
          child.active_group = null;
          emitPlayer(child.player_id);
        }
      }
      target.group_members = [...members];
      emitPlayer(target.player_id);
      const groupQueue = queues.get(target.player_id);
      if (groupQueue) {
        groupQueue.active = members.size > 0;
        emitQueue(groupQueue.queue_id);
      }
      return null;
    },
    "players/cmd/set_option": (args) => {
      const player = players.get(String(args.player_id));
      const option = player?.options?.find((item) => item.key === args.option_key);
      if (option) {
        option.value = args.option_value as string | number | boolean;
        emitPlayer(String(args.player_id));
      }
      return null;
    },
    "players/cmd/select_sound_mode": (args) => {
      const player = players.get(String(args.player_id));
      if (player) {
        player.active_sound_mode = String(args.sound_mode);
        emitPlayer(player.player_id);
      }
      return null;
    },
    "players/sleep_timer/set": (args) => {
      const player = players.get(String(args.player_id));
      const expiresAt = now() + Number(args.seconds);
      if (player) {
        player.sleep_timer_expires_at = expiresAt;
        emitPlayer(player.player_id);
      }
      return expiresAt;
    },
    "players/sleep_timer/clear": (args) => {
      const player = players.get(String(args.player_id));
      if (player) {
        player.sleep_timer_expires_at = null;
        emitPlayer(player.player_id);
      }
      return null;
    },
    "players/sleep_timer/get": (args) =>
      players.get(String(args.player_id))?.sleep_timer_expires_at ?? null,
    "players/plugin_sources": () => [],
  };

  let connState: ConnState = "idle";

  return {
    kind: "demo",
    get state() {
      return connState;
    },
    lastError: undefined,
    async connect(): Promise<ServerInfo> {
      connState = "connecting";
      for (const cb of stateSubs) cb("connecting");
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      connState = "connected";
      for (const cb of stateSubs) cb("connected");
      return {
        server_version: "2.10.6 (demo)",
        schema_version: 101,
        onboard_done: true,
      };
    },
    send<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
      const handler = commands[command];
      if (!handler) {
        // Behave like MAS for commands this demo does not implement.
        return Promise.resolve(null as T);
      }
      try {
        return Promise.resolve(handler(args) as T);
      } catch (err) {
        return Promise.reject(err as Error);
      }
    },
    onState(cb) {
      stateSubs.add(cb);
      return () => stateSubs.delete(cb);
    },
    onEvent(cb) {
      eventSubs.add(cb);
      return () => eventSubs.delete(cb);
    },
    close() {
      window.clearInterval(timer);
      connState = "idle";
      for (const cb of stateSubs) cb("idle");
    },
  };
}
