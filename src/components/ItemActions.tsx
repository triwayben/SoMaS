import type { ItemMapping, MediaItem } from "../api/types";
import { itemSubtitle } from "../lib/players";
import { usePlayActions } from "../lib/usePlayActions";
import { useApp } from "../store";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ItemActionsSheet({
  item,
  onClose,
}: {
  item: ItemMapping | MediaItem | null;
  onClose: () => void;
}) {
  const play = usePlayActions();
  const app = useApp();
  if (!item) return null;

  const uri = item.uri ?? "";

  return (
    <Sheet open onClose={onClose} title={item.name} subtitle={itemSubtitle(item)}>
      <div className="action-list">
        <button
          className="action"
          onClick={() => {
            play.play(item);
            onClose();
          }}
        >
          <Icon name="play" size={20} />
          <span>Play now</span>
        </button>
        <button
          className="action"
          onClick={() => {
            play.playNext(item);
            onClose();
          }}
        >
          <Icon name="playNext" size={20} />
          <span>Play next</span>
        </button>
        <button
          className="action"
          onClick={() => {
            play.addToQueue(item);
            onClose();
          }}
        >
          <Icon name="addQueue" size={20} />
          <span>Add to queue</span>
        </button>
        <button
          className="action"
          onClick={() => {
            void app.setFavorite(
              uri,
              !item.favorite,
              item.media_type ?? undefined,
              item.item_id ?? undefined,
            );
            onClose();
          }}
        >
          <Icon name={item.favorite ? "heartFilled" : "heart"} size={20} />
          <span>{item.favorite ? "Remove from favorites" : "Add to favorites"}</span>
        </button>
        <button
          className="action"
          onClick={() => {
            if (uri && navigator.clipboard) {
              void navigator.clipboard.writeText(uri);
              app.notify("Item link copied");
            }
            onClose();
          }}
        >
          <Icon name="external" size={20} />
          <span>Copy item link</span>
        </button>
      </div>
    </Sheet>
  );
}
