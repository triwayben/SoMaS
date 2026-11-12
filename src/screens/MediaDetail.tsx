import { useEffect, useState } from "react";
import type { MediaItem } from "../api/types";
import { Artwork } from "../components/Artwork";
import { Icon } from "../components/Icon";
import { ItemActionsSheet } from "../components/ItemActions";
import { EmptyState, MediaRow, Spinner } from "../components/Media";
import { TopBar } from "../components/TopBar";
import { formatTime, totalDuration } from "../lib/format";
import {
  itemImage,
  itemSeed,
  itemSubtitle,
  itemTitle,
  queueFor,
} from "../lib/players";
import { usePlayActions } from "../lib/usePlayActions";
import { useNav } from "../nav";
import { useApp } from "../store";

const TRACK_COMMANDS: Record<string, string> = {
  album: "music/albums/album_tracks",
  playlist: "music/playlists/playlist_tracks",
  artist: "music/artists/artist_tracks",
  genre: "music/genres/tracks",
  podcast: "music/podcasts/podcast_episodes",
  audiobook: "music/audiobooks/library_items",
};

export function MediaDetailScreen({ item }: { item: MediaItem }) {
  const app = useApp();
  const nav = useNav();
  const play = usePlayActions();
  const [tracks, setTracks] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [sheetItem, setSheetItem] = useState<MediaItem | null>(null);

  const command = TRACK_COMMANDS[item.media_type ?? ""] ?? "music/tracks/library_items";
  const { send } = app;

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    const args: Record<string, unknown> = {
      item_id: item.item_id ?? "",
      provider_instance_id_or_domain: item.provider ?? "library",
      limit: 500,
    };
    void send<MediaItem[]>(command, args)
      .then((result) => {
        if (!cancelled) setTracks(result ?? []);
      })
      .catch(() => {
        if (!cancelled) setTracks([]);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [command, item.item_id, item.provider, send]);

  const queue = queueFor(app.players, app.queues, app.selectedId);
  const currentUri = queue?.current_item?.media_item?.uri;

  return (
    <>
      <TopBar title={item.name} onBack={nav.back} />
      <div className="detail">
        <Artwork
          image={itemImage(item)}
          seed={itemSeed(item)}
          baseUrl={app.baseUrl}
          width={168}
          height={168}
          radius={8}
          requestSize={512}
          alt={item.name}
          className="detail__art"
        />
        <div className="detail__meta">
          <div className="detail__type">{item.media_type}</div>
          <h2 className="detail__name">{item.name}</h2>
          <div className="detail__sub">{itemSubtitle(item)}</div>
          <div className="detail__count">
            {tracks.length ? `${tracks.length} items · ${totalDuration(tracks)}` : "Loading…"}
          </div>
        </div>
        <div className="detail__actions">
          <button className="btn btn--primary" onClick={() => play.play(item)}>
            <Icon name="play" size={18} />
            Play
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => {
              if (!item.uri || !app.selectedId) return;
              void app.playMedia(app.selectedId, item.uri, "next");
            }}
          >
            <Icon name="playNext" size={18} />
            Play next
          </button>
          <button
            className="icon-btn icon-btn--outline"
            aria-label={item.favorite ? "Remove from favorites" : "Add to favorites"}
            onClick={() =>
              void app.setFavorite(
                item.uri ?? "",
                !item.favorite,
                item.media_type ?? undefined,
                item.item_id ?? undefined,
              )
            }
          >
            <Icon name={item.favorite ? "heartFilled" : "heart"} size={20} />
          </button>
        </div>
      </div>

      {busy ? <Spinner /> : null}
      {!busy && tracks.length === 0 ? (
        <EmptyState icon="music" title="No tracks returned" body="This item may be stream-only." />
      ) : null}

      <div className="rows rows--tight">
        {tracks.map((track, index) => (
          <MediaRow
            key={`${track.uri ?? track.name}-${index}`}
            leadingIndex={index}
            title={itemTitle(track) || track.name}
            subtitle={itemSubtitle(track)}
            active={Boolean(currentUri && track.uri === currentUri)}
            trail={<span className="row__duration">{formatTime(track.duration)}</span>}
            onClick={() => play.play(track)}
            onMenu={() => setSheetItem(track)}
          />
        ))}
      </div>

      <ItemActionsSheet item={sheetItem} onClose={() => setSheetItem(null)} />
    </>
  );
}
