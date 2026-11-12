import type { PlayerQueue } from "../api/types";
import { imageUrl } from "../lib/images";
import { itemImage } from "../lib/players";

/** Blurred cover art that tints a glass surface with the current album's colour. */
export function CoverGlow({ queue, baseUrl }: { queue?: PlayerQueue; baseUrl: string }) {
  const url = imageUrl(itemImage(queue?.current_item), baseUrl, 160);
  if (!url) return null;
  return (
    <span className="cover-glow" aria-hidden="true" style={{ backgroundImage: `url("${url}")` }} />
  );
}
