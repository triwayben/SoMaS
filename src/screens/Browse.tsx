import { useEffect, useState } from "react";
import type { BrowseFolder, ItemMapping, MediaItem } from "../api/types";
import { Icon } from "../components/Icon";
import { ItemActionsSheet } from "../components/ItemActions";
import { EmptyState, MediaRow, Spinner } from "../components/Media";
import { TopBar } from "../components/TopBar";
import { itemImage, itemSeed, itemSubtitle } from "../lib/players";
import { usePlayActions } from "../lib/usePlayActions";
import { useNav, type Route } from "../nav";
import { useApp } from "../store";

const LIBRARY_PLURALS: Record<string, string> = {
  album: "albums",
  artist: "artists",
  track: "tracks",
  playlist: "playlists",
  radio: "radios",
  genre: "genres",
  podcast: "podcasts",
  audiobook: "audiobooks",
  audiobook_track: "audiobooks",
};

function isFolder(item: MediaItem | BrowseFolder): item is BrowseFolder {
  return typeof (item as BrowseFolder).path === "string" && !(item as MediaItem).uri;
}

export function BrowseScreen({ route }: { route: Extract<Route, { name: "browse" }> }) {
  const app = useApp();
  const nav = useNav();
  const play = usePlayActions();
  const [items, setItems] = useState<Array<MediaItem | BrowseFolder>>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [sheetItem, setSheetItem] = useState<ItemMapping | MediaItem | null>(null);
  const { query, title } = route;
  const { send } = app;

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(undefined);
    const run = async () => {
      try {
        let result: Array<MediaItem | BrowseFolder> = [];
        if (query.kind === "library") {
          const plural = LIBRARY_PLURALS[query.mediaType] ?? `${query.mediaType}s`;
          result = await send<Array<MediaItem | BrowseFolder>>(`music/${plural}/library_items`, {
            limit: 300,
          });
        } else if (query.kind === "path") {
          result = await send<Array<MediaItem | BrowseFolder>>("music/browse", {
            path: query.path,
            limit: 200,
          });
        } else {
          result = await send<Array<MediaItem | BrowseFolder>>("music/recommendations/items", {
            provider: query.provider,
            item_id: query.itemId,
          });
        }
        if (!cancelled) setItems(result ?? []);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || "Could not load this list");
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [query, send]);

  const open = (item: MediaItem | BrowseFolder) => {
    if (isFolder(item)) {
      nav.push({
        name: "browse",
        title: item.name,
        query: { kind: "path", path: item.path },
      });
      return;
    }
    const type = item.media_type ?? "";
    if (["album", "playlist", "artist", "genre", "podcast", "audiobook"].includes(type)) {
      nav.push({ name: "media", item });
    } else {
      play.play(item);
    }
  };

  return (
    <>
      <TopBar title={title} onBack={nav.back} />
      {busy ? <Spinner /> : null}
      {error ? <EmptyState icon="offline" title="Could not load" body={error} /> : null}
      {!busy && !error && items.length === 0 ? (
        <EmptyState
          icon="folder"
          title="Nothing here yet"
          body="This library is empty, or the provider did not return any folders."
        />
      ) : null}
      <div className="rows rows--tight">
        {items.map((item, index) => (
          <MediaRow
            key={`${(item as MediaItem).uri ?? (item as BrowseFolder).path}-${index}`}
            title={item.name}
            subtitle={isFolder(item) ? "Folder" : itemSubtitle(item)}
            image={isFolder(item) ? undefined : itemImage(item)}
            seed={isFolder(item) ? undefined : itemSeed(item)}
            icon={isFolder(item) ? "folder" : undefined}
            baseUrl={app.baseUrl}
            surface
            round={!isFolder(item) && item.media_type === "artist"}
            trail={
              isFolder(item) ? (
                <Icon name="chevronRight" size={18} />
              ) : item.media_type === "radio" ? (
                <Icon name="play" size={16} />
              ) : null
            }
            onClick={() => open(item)}
            onMenu={isFolder(item) ? undefined : () => setSheetItem(item)}
          />
        ))}
      </div>
      <ItemActionsSheet item={sheetItem} onClose={() => setSheetItem(null)} />
    </>
  );
}
