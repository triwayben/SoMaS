import { useApp } from "../store";
import type { ItemMapping, MediaItem } from "../api/types";

export function usePlayActions() {
  const { selectedId, playMedia, notify } = useApp();

  const play = (item: ItemMapping | MediaItem | null | undefined) => {
    if (!item?.uri) {
      notify("This item cannot be played");
      return;
    }
    if (!selectedId) {
      notify("Choose a room first");
      return;
    }
    void playMedia(selectedId, item.uri, "play");
  };

  const playNext = (item: ItemMapping | MediaItem | null | undefined) => {
    if (!item?.uri || !selectedId) return;
    void playMedia(selectedId, item.uri, "next");
  };

  const addToQueue = (item: ItemMapping | MediaItem | null | undefined) => {
    if (!item?.uri || !selectedId) return;
    void playMedia(selectedId, item.uri, "add");
  };

  return { play, playNext, addToQueue, selectedId };
}
