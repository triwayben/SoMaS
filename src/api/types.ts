/**
 * Subset of the Music Assistant data model used by this app.
 * Field names mirror the JSON that mass-server puts on the wire.
 */

export type PlaybackState = "idle" | "playing" | "paused" | "stopped" | "unknown";
export type RepeatMode = "off" | "one" | "all";

export interface ImageInfo {
  type?: string | null;
  path?: string | null;
  provider?: string | null;
  remotely_accessible?: boolean | null;
  proxy_id?: string | null;
}

export interface ItemMapping {
  uri?: string | null;
  name: string;
  media_type?: string | null;
  item_id?: string | null;
  provider?: string | null;
  version?: string | null;
  image?: ImageInfo | null;
  artists?: ArtistRef[] | null;
  album?: MediaItem | null;
  duration?: number | null;
  favorite?: boolean | null;
  is_playable?: boolean | null;
  [key: string]: unknown;
}

export interface ArtistRef {
  uri?: string | null;
  name: string;
  media_type?: string | null;
  image?: ImageInfo | null;
  item_id?: string | null;
  provider?: string | null;
}

export interface MediaItem extends ItemMapping {
  metadata?: Record<string, unknown> | null;
  provider_mappings?: unknown[] | null;
  year?: number | null;
  track_number?: number | null;
  disc_number?: number | null;
  album_type?: string | null;
  is_explicit?: boolean | null;
  palette?: { primary?: string[] | null; secondary?: string[] | null } | null;
}

export interface PlayerSource {
  id: string;
  name: string;
  passive?: boolean;
  can_play_pause?: boolean;
  can_seek?: boolean;
  can_next_previous?: boolean;
}

export interface PlayerOptionEntry {
  key: string;
  name: string;
  type: "boolean" | "integer" | "float" | "string";
  value: boolean | number | string;
}

export interface PlayerOption {
  key: string;
  name: string;
  type: "boolean" | "integer" | "float" | "string";
  value: boolean | number | string;
  read_only?: boolean;
  min_value?: number | null;
  max_value?: number | null;
  step?: number | null;
  options?: PlayerOptionEntry[] | null;
}

export interface PlayerSoundMode {
  id: string;
  name: string;
  passive?: boolean;
}

export interface DeviceInfo {
  model?: string;
  manufacturer?: string;
  software_version?: string | null;
  model_id?: string | null;
  ip_address?: string | null;
  identifiers?: Record<string, string>;
}

export interface PlayerMedia {
  uri?: string | null;
  media_type?: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  image_url?: string | null;
  duration?: number | null;
  elapsed_time?: number | null;
  elapsed_time_last_updated?: number | null;
}

export interface Player {
  player_id: string;
  provider: string;
  type?: string;
  name: string;
  display_name?: string;
  available: boolean;
  device_info?: DeviceInfo;
  supported_features?: string[];
  playback_state?: PlaybackState;
  state?: PlaybackState;
  elapsed_time?: number | null;
  elapsed_time_last_updated?: number | null;
  powered?: boolean | null;
  volume_level?: number | null;
  volume_muted?: boolean | null;
  group_volume?: number | null;
  group_volume_muted?: boolean | null;
  group_members?: string[];
  group_childs?: string[];
  static_group_members?: string[];
  can_group_with?: string[];
  synced_to?: string | null;
  active_group?: string | null;
  active_sound_mode?: string | null;
  sound_mode_list?: PlayerSoundMode[];
  options?: PlayerOption[];
  active_source?: string | null;
  source_list?: PlayerSource[];
  current_media?: PlayerMedia | null;
  sleep_timer_expires_at?: number | null;
  active_output_protocol?: string | null;
  extra_attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface QueueItem {
  queue_id?: string;
  queue_item_id: string;
  name: string;
  duration?: number | null;
  media_item?: MediaItem | null;
  streamdetails?: {
    stream_metadata?: {
      title?: string | null;
      artist?: string | null;
      album?: string | null;
      image_url?: string | null;
    } | null;
    stream_title?: string | null;
    [key: string]: unknown;
  } | null;
  index?: number;
  [key: string]: unknown;
}

export interface PlayerQueue {
  queue_id: string;
  active: boolean;
  display_name: string;
  available: boolean;
  items: number;
  shuffle_enabled?: boolean;
  repeat_mode?: RepeatMode;
  crossfade_enabled?: boolean;
  autoplay_enabled?: boolean;
  dont_stop_the_music_enabled?: boolean;
  current_index?: number | null;
  index_in_buffer?: number | null;
  ended?: boolean;
  elapsed_time?: number;
  elapsed_time_last_updated?: number;
  playback_speed?: number;
  state?: PlaybackState;
  current_item?: QueueItem | null;
  next_item?: QueueItem | null;
  sources?: ItemMapping[];
  radio_source?: ItemMapping[];
  flow_mode?: boolean;
  is_dynamic?: boolean;
  [key: string]: unknown;
}

export interface MusicProvider {
  instance_id: string;
  domain: string;
  name: string;
  type?: string;
  available?: boolean;
  supported_features?: string[];
  is_streaming_provider?: boolean;
  status?: string;
  [key: string]: unknown;
}

export interface BrowseFolder {
  name: string;
  path: string;
  media_type?: string;
  uri?: string;
  image?: ImageInfo | null;
  [key: string]: unknown;
}

export interface RecommendationsFolder {
  item_id: string;
  name: string;
  provider: string;
  items?: MediaItem[];
  icon?: string | null;
  [key: string]: unknown;
}

export interface SearchResults {
  tracks?: MediaItem[];
  albums?: MediaItem[];
  artists?: MediaItem[];
  playlists?: MediaItem[];
  radios?: MediaItem[];
  podcasts?: MediaItem[];
  audiobooks?: MediaItem[];
  genres?: MediaItem[];
  [key: string]: unknown;
}

export interface MasEvent {
  event: string;
  object_id?: string | null;
  data?: unknown;
}

export interface ServerInfo {
  base_url?: string;
  server_version?: string;
  schema_version?: number;
  min_supported_schema_version?: number;
  homeassistant_addon?: boolean;
  onboard_done?: boolean;
  [key: string]: unknown;
}

export type ConnState = "idle" | "connecting" | "connected" | "reconnecting" | "error";

export interface Backend {
  readonly kind: "mas" | "demo";
  readonly state: ConnState;
  readonly lastError?: string;
  connect(): Promise<ServerInfo>;
  send<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
  onState(cb: (state: ConnState, detail?: string) => void): () => void;
  onEvent(cb: (event: MasEvent) => void): () => void;
  close(): void;
}
