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
  if (media.image?.path) return media.image;
  const metadataImages = (media.metadata as { images?: ImageInfo[] } | null | undefined)?.images;
  if (metadataImages?.length) {
    const thumb = metadataImages.find((image) => image.type === "thumb") ?? metadataImages[0];
    if (thumb?.path) return thumb;
  }
  if (media.album?.image?.path) return media.album.image;
  if (media.artists?.[0]?.image?.path) return media.artists[0].image;
  return undefined;
}

export function itemSeed(item?: ItemMapping | MediaItem | null): string {
  if (!item) return "sonos";
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

export function elapsedFor(queue?: PlayerQueue | null): number {
  if (!queue) return 0;
  const base = queue.elapsed_time ?? 0;
  if (queue.state !== "playing") return base;
  const updated = queue.elapsed_time_last_updated ?? 0;
  const speed = queue.playback_speed ?? 1;
  const delta = Math.max(0, Date.now() / 1000 - updated);
  return base + delta * speed;
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
