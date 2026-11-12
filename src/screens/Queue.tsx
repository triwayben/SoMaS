import { useEffect, useState } from "react";
import { Artwork } from "../components/Artwork";
import { Icon } from "../components/Icon";
import { EmptyState, Spinner } from "../components/Media";
import { formatTime, totalDuration } from "../lib/format";
import {
  itemImage,
  itemSeed,
  itemSubtitle,
  itemTitle,
  queueFor,
} from "../lib/players";
import { useApp } from "../store";

export function QueueScreen({ onBack }: { onBack: () => void }) {
  const app = useApp();
  const queue = queueFor(app.players, app.queues, app.selectedId);
  const queueId = queue?.queue_id;
  const items = queueId ? app.queueItems[queueId] ?? [] : [];
  const currentIndex = queue?.current_index ?? -1;
  const [busy, setBusy] = useState(true);
  const { loadQueue } = app;

  useEffect(() => {
    if (!queueId) {
      setBusy(false);
      return;
    }
    setBusy(true);
    void loadQueue(queueId).finally(() => setBusy(false));
  }, [queueId, loadQueue]);

  return (
    <div className="queue">
      <header className="queue__head">
        <button className="icon-btn" onClick={onBack} aria-label="Back to Now Playing">
          <Icon name="chevronDown" size={24} />
        </button>
        <div className="queue__titles">
          <h1>Queue</h1>
          <span>
            {queue?.display_name ?? "This room"} · {items.length} items
            {items.length ? ` · ${totalDuration(items)}` : ""}
          </span>
        </div>
        {items.length ? (
          <button
            className="text-btn"
            onClick={() => queueId && void app.clearQueue(queueId)}
          >
            Clear
          </button>
        ) : null}
      </header>

      {busy ? <Spinner /> : null}

      {!busy && items.length === 0 ? (
        <EmptyState
          icon="queue"
          title="The queue is empty"
          body="Play an album, playlist or station and it will show up here."
        />
      ) : null}

      <div className="rows rows--queue">
        {items.map((item, index) => {
          const isCurrent = index === currentIndex;
          return (
            <div className={`qitem ${isCurrent ? "is-current" : ""}`} key={item.queue_item_id}>
              <button
                className="qitem__main"
                onClick={() => queueId && void app.playIndex(queueId, index)}
              >
                <span className="qitem__art">
                  <Artwork
                    image={itemImage(item)}
                    seed={itemSeed(item.media_item)}
                    baseUrl={app.baseUrl}
                    radius={4}
                    requestSize={160}
                    alt={itemTitle(item)}
                  />
                </span>
                <span className="qitem__body">
                  <span className="qitem__title">{itemTitle(item)}</span>
                  <span className="qitem__sub">{itemSubtitle(item)}</span>
                </span>
                <span className="qitem__duration">{formatTime(item.duration)}</span>
              </button>
              <button
                className="qitem__remove"
                aria-label={`Remove ${itemTitle(item)} from queue`}
                onClick={() => queueId && void app.removeQueueItem(queueId, item.queue_item_id)}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
