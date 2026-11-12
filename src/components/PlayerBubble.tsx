import { Artwork } from "./Artwork";
import { CoverGlow } from "./CoverGlow";
import { Icon } from "./Icon";
import { Slider } from "./Slider";
import {
  elapsedFor,
  groupMembers,
  itemImage,
  itemSeed,
  itemTitle,
  leaderOf,
  queueFor,
  volumeLevelOf,
} from "../lib/players";
import { useApp } from "../store";

interface PlayerBubbleProps {
  onOpen: () => void;
  onQueue: () => void;
  onSettings: (playerId: string) => void;
}

/**
 * Floating "glass" player card: room + now playing, queue shortcut, big
 * transport button and a group volume row.
 */
export function PlayerBubble({ onOpen, onQueue, onSettings }: PlayerBubbleProps) {
  const app = useApp();
  const player = leaderOf(app.players, app.selectedId);
  const queue = queueFor(app.players, app.queues, app.selectedId);
  const current = queue?.current_item;
  const playing = queue?.state === "playing";
  const duration = current?.duration ?? 0;
  const elapsed = elapsedFor(queue);
  const progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  const level = volumeLevelOf(player);
  const muted = Boolean(player?.volume_muted);
  const members = player
    ? groupMembers(player).filter((id) => id !== player.player_id && app.players[id])
    : [];
  const queueCount = queue?.items ?? 0;

  if (!app.selectedId) return null;

  const live = current?.streamdetails?.stream_metadata;
  const media = current?.media_item;
  const artist =
    live?.artist ??
    media?.artists?.map((entry) => entry.name).join(", ") ??
    media?.album?.artists?.map((entry) => entry.name).join(", ") ??
    "";
  const album = live?.album ?? media?.album?.name ?? "";
  const track = itemTitle(current);

  const subtitle = current
    ? [track, artist, album].filter((part, index, all) => Boolean(part) && all.indexOf(part) === index).join(" · ")
    : "Nothing playing";
  return (
    <section className="bubble" aria-label="Now playing">
      <CoverGlow queue={queue} baseUrl={app.baseUrl} />
      {current && duration > 0 ? (
        <div className="bubble__progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      <div className="bubble__row">
        <button
          className="bubble__art"
          onClick={onOpen}
          aria-label={track ? `Now playing: ${track}` : "Open now playing"}
          type="button"
        >
          {current ? (
            <Artwork
              image={itemImage(current)}
              seed={itemSeed(media)}
              baseUrl={app.baseUrl}
              radius={9}
              requestSize={256}
              alt={track}
            />
          ) : (
            <Icon name="speaker" size={22} />
          )}
        </button>

        <button className="bubble__meta" onClick={onOpen} type="button">
          <span className="bubble__title">
            <span className="bubble__title-text">{player?.name ?? "No room"}</span>
            {members.length ? <span className="bubble__badge">+{members.length}</span> : null}
            <Icon name="signal" size={13} className="bubble__signal" />
          </span>
          <span className="bubble__sub">{subtitle}</span>
        </button>

        <button
          className="bubble__queue"
          onClick={onQueue}
          aria-label={`Open queue, ${queueCount} items`}
          type="button"
        >
          <Icon name="queue" size={20} />
          {queueCount > 0 ? (
            <span className="bubble__count">{queueCount > 99 ? "99+" : queueCount}</span>
          ) : null}
        </button>

        <button
          className="bubble__play"
          onClick={() => void app.togglePlay(app.selectedId!)}
          aria-label={playing ? "Pause" : "Play"}
          type="button"
        >
          <Icon name={playing ? "pause" : "play"} size={24} />
        </button>
      </div>

      <div className="bubble__row bubble__row--volume">
        <button
          className="bubble__icon"
          onClick={() => player && void app.toggleMute(player.player_id)}
          aria-label={muted ? "Unmute" : "Mute"}
          type="button"
        >
          <Icon
            name={muted ? "volumeMute" : level > 40 ? "volume" : "volumeLow"}
            size={18}
          />
        </button>
        <Slider
          label="Volume"
          value={level}
          large
          onChange={(value) => player && void app.setVolume(player.player_id, value)}
          formatValue={(value) => `${Math.round(value)}%`}
        />
        <button
          className="bubble__icon"
          onClick={() => player && onSettings(player.player_id)}
          aria-label="Room settings"
          type="button"
        >
          <Icon name="sliders" size={18} />
        </button>
      </div>
    </section>
  );
}
