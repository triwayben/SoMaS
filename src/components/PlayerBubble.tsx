import { Artwork } from "./Artwork";
import { CoverGlow } from "./CoverGlow";
import { Icon } from "./Icon";
import { Slider } from "./Slider";
import {
  groupMembers,
  itemImage,
  itemSeed,
  itemTitle,
  leaderOf,
  playbackState,
  positionFor,
  queueFor,
  volumeLevelOf,
} from "../lib/players";
import { useApp } from "../store";
import { useProgressFill } from "../lib/useProgressFill";
import { useTicker } from "../lib/useTicker";
import { useVolumeStep } from "../lib/volumeStep";

interface PlayerBubbleProps {
  onOpen: () => void;
  onGroup: () => void;
  onSettings: (playerId: string) => void;
}

/**
 * Floating "glass" player card: room + now playing, grouping shortcut, big
 * transport button and a group volume row.
 */
export function PlayerBubble({ onOpen, onGroup, onSettings }: PlayerBubbleProps) {
  const app = useApp();
  const volumeStep = useVolumeStep();
  const player = leaderOf(app.players, app.selectedId);
  const queue = queueFor(app.players, app.queues, app.selectedId);
  const current = queue?.current_item;
  const playing = playbackState(player) === "playing" || queue?.state === "playing";
  const duration = current?.duration ?? 0;
  // Re-render once a second so the bar advances even between server updates.
  useTicker(playing);
  const elapsed = positionFor(player, queue, duration);
  const progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  const hasProgress = Boolean(current) && duration > 0;
  // While playing, the line is painted per frame so it glides rather than stepping once a second.
  const fillRef = useProgressFill(
    hasProgress && playing,
    () => (duration > 0 ? (positionFor(player, queue, duration) / duration) * 100 : 0),
  );
  const level = volumeLevelOf(player);
  const muted = Boolean(player?.volume_muted);
  const members = player
    ? groupMembers(player).filter((id) => id !== player.player_id && app.players[id])
    : [];
  // Everyone driven by this room's transport, counting the room itself.
  const groupTotal = members.length + 1;

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
      {hasProgress ? (
        <div className="bubble__progress" aria-hidden="true">
          {/* The width from state is correct at render time; the frame loop above keeps
              advancing it in between. */}
          <span ref={fillRef} style={{ width: `${progress}%` }} />
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
          className="bubble__group"
          onClick={onGroup}
          aria-label={`Group, ${groupTotal} ${groupTotal === 1 ? "speaker" : "speakers"}`}
          title="Group speakers"
          type="button"
        >
          <Icon name="speaker" size={19} />
          <span className="bubble__count">{groupTotal}</span>
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
          tapStep={volumeStep}
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
