import type {
  ImageInfo,
  ItemMapping,
  MediaItem,
  MusicProvider,
  Player,
  PlayerQueue,
  QueueItem,
} from "../api/types";

export function groupMembers(player?: Player | null): string[] {
  return player?.group_members ?? player?.group_childs ?? [];
}

export function isPlaying(player?: Player | null): boolean {
  return (player?.playback_state ?? player?.state) === "playing";
}

export function isPaused(player?: Player | null): boolean {
  return (player?.playback_state ?? player?.state) === "paused";
}

export function playbackState(player?: Player | null) {
  return player?.playback_state ?? player?.state ?? "idle";
}

/** The player whose queue/transport actually drives the room (sync leader if grouped). */
export function leaderOf(
  players: Record<string, Player>,
  playerId: string | null | undefined,
): Player | undefined {
  if (!playerId) return undefined;
  const player = players[playerId];
  if (!player) return undefined;
  const leaderId = player.synced_to ?? player.active_group;
  if (leaderId && players[leaderId]) return players[leaderId];
  return player;
}

/** The Music Assistant queue that belongs to a player (grouped players share the leader's). */
export function queueFor(
  players: Record<string, Player>,
  queues: Record<string, PlayerQueue>,
  playerId: string | null | undefined,
): PlayerQueue | undefined {
  const player = playerId ? players[playerId] : undefined;
  if (!player) {
    return Object.values(queues).find((queue) => queue.active) ?? Object.values(queues)[0];
  }
  const leader = leaderOf(players, player.player_id) ?? player;
  const candidates = [
    player.active_source,
    leader.active_source,
    leader.player_id,
    player.player_id,
    leader.active_group,
  ];
  for (const candidate of candidates) {
    if (candidate && queues[candidate]) return queues[candidate];
  }
  return (
    Object.values(queues).find((queue) => queue.active) ??
    Object.values(queues).find((queue) => queue.queue_id === leader.player_id)
  );
}

export function queueForExact(
  queues: Record<string, PlayerQueue>,
  playerId: string | null | undefined,
): PlayerQueue | undefined {
  if (!playerId) return undefined;
  return queues[playerId];
}

/** Volume control target: the group leader when the room is grouped. */
export function volumeTarget(
  players: Record<string, Player>,
  playerId: string | null | undefined,
): Player | undefined {
  const leader = leaderOf(players, playerId);
  return leader ?? (playerId ? players[playerId] : undefined);
}

export function volumeLevelOf(player?: Player | null): number {
  if (!player) return 0;
  if (typeof player.group_volume === "number") return player.group_volume;
  return player.volume_level ?? 0;
}

/** Servers may identify cached art by proxy id alone, with no path. */
function hasImage(image?: ImageInfo | null): image is ImageInfo {
  return Boolean(image && (image.path || image.proxy_id));
}

export function itemImage(item?: QueueItem | ItemMapping | MediaItem | null): ImageInfo | undefined {
  if (!item) return undefined;
  const queueItem = item as QueueItem;
  if (queueItem.streamdetails?.stream_metadata?.image_url) {
    return {
      type: "thumb",
      path: queueItem.streamdetails.stream_metadata.image_url,
      provider: "builtin",
      remotely_accessible: true,
    };
  }
  const media = queueItem.media_item ?? (item as MediaItem);
  if (!media) return undefined;
  if (hasImage(media.image)) return media.image;
  const metadataImages = (media.metadata as { images?: ImageInfo[] } | null | undefined)?.images;
  if (metadataImages?.length) {
    const thumb = metadataImages.find((image) => image.type === "thumb") ?? metadataImages[0];
    if (hasImage(thumb)) return thumb;
  }
  if (hasImage(media.album?.image)) return media.album.image;
  if (hasImage(media.artists?.[0]?.image)) return media.artists[0].image;
  return undefined;
}

export function itemSeed(item?: ItemMapping | MediaItem | null): string {
  if (!item) return "somas";
  const artist = item.artists?.[0]?.name ?? item.album?.name ?? "";
  return `${item.name ?? ""}${artist ? `-${artist}` : ""}`;
}

export function itemTitle(item?: QueueItem | ItemMapping | null): string {
  if (!item) return "";
  const queueItem = item as QueueItem;
  return (
    queueItem.streamdetails?.stream_metadata?.title ??
    (queueItem.media_item as MediaItem | undefined)?.name ??
    item.name ??
    ""
  );
}

export function itemSubtitle(item?: QueueItem | ItemMapping | null): string {
  if (!item) return "";
  const queueItem = item as QueueItem;
  const live = queueItem.streamdetails?.stream_metadata;
  if (live?.artist) return live.artist;
  const media = queueItem.media_item ?? (item as MediaItem);
  const artists = media.artists?.map((artist) => artist.name).filter(Boolean) ?? [];
  if (artists.length) return artists.join(", ");
  if (media.album?.name) return media.album.name;
  const owner = (media as { owner?: string }).owner;
  if (typeof owner === "string" && owner) return owner;
  return "";
}

export function activeSourceLabel(
  player: Player | undefined,
  providers: MusicProvider[],
): string {
  if (!player) return "";
  const sourceId = player.active_source;
  if (!sourceId) return player.available ? "Idle" : "Unavailable";
  if (sourceId === player.player_id || sourceId === "mass") return "Music Assistant";
  const source = player.source_list?.find((entry) => entry.id === sourceId);
  if (source) return source.name;
  const provider = providers.find((entry) => entry.instance_id === sourceId);
  if (provider) return provider.name;
  if (sourceId === "tv") return "TV";
  if (sourceId === "bluetooth") return "Bluetooth";
  return sourceId;
}

/**
 * How far a reported position may be carried forward. A reading that has not been refreshed
 * for longer than this is treated as stale and held, instead of inflating the position by how
 * long the app has been open.
 */
const MAX_EXTRAPOLATION_SECONDS = 10;

function carried(base: number, updated: number | null | undefined, playing: boolean, speed: number) {
  if (!playing || !updated) return base;
  // The field is seconds in every payload we have seen; tolerate milliseconds too.
  const anchor = updated > 1e12 ? updated / 1000 : updated;
  const age = Date.now() / 1000 - anchor;
  if (!Number.isFinite(age) || age <= 0) return base;
  return base + Math.min(age, MAX_EXTRAPOLATION_SECONDS) * speed;
}

/**
 * Position reported by the player itself. The server refreshes this every second while playing
 * (as `player_updated`). Careful: some players report their cumulative stream position, which
 * keeps counting across tracks, so this value is only trusted while it fits the track.
 */
export function elapsedForPlayer(player?: Player | null): number | null {
  if (!player) return null;
  const base = player.elapsed_time;
  if (base == null) return null;
  return carried(
    base,
    player.elapsed_time_last_updated,
    playbackState(player) === "playing",
    1,
  );
}

/**
 * Best known playback position, kept inside the current track.
 *
 * The queue's position is preferred: Music Assistant keeps it as the position within the current
 * track, while a player may report its cumulative stream position or a frozen reading. `duration`
 * is what makes the choice safe - a candidate that does not fit inside the track is skipped, and
 * the player is used only when no queue position is available.
 */
export function positionFor(
  player?: Player | null,
  queue?: PlayerQueue | null,
  duration = 0,
): number {
  const candidates = [elapsedFor(queue), elapsedForPlayer(player)].filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (!candidates.length) return 0;
  const fits = (value: number) => duration > 0 && value <= duration + 1;
  const chosen = candidates.find(fits) ?? candidates[0];
  const clamped = duration > 0 ? Math.min(chosen, duration) : chosen;
  return Math.max(0, clamped);
}

export function elapsedFor(queue?: PlayerQueue | null): number {
  if (!queue) return 0;
  const base = queue.elapsed_time ?? 0;
  if (queue.state !== "playing") return base;
  const updated = queue.elapsed_time_last_updated;
  // Without an anchor there is nothing to extrapolate from; adding wall-clock time to a zero
  // anchor would jump the position to the end of the track.
  if (!updated) return base;
  return carried(base, updated, true, queue.playback_speed ?? 1);
}

export function sortRooms(players: Player[]): Player[] {
  return [...players].sort((a, b) => a.name.localeCompare(b.name));
}

/** Rooms that are not synced to another room, i.e. group leaders and standalone rooms. */
export function topLevelRooms(players: Player[]): Player[] {
  return sortRooms(players.filter((player) => !player.synced_to));
}

export function canGroupWith(player: Player, target: Player): boolean {
  if (player.player_id === target.player_id) return false;
  if (player.synced_to === target.player_id) return false;
  const allowed = target.can_group_with ?? [];
  if (!allowed.length) return player.provider === target.provider;
  return (
    allowed.includes(player.player_id) ||
    allowed.includes(player.provider) ||
    allowed.includes(target.provider)
  );
}
