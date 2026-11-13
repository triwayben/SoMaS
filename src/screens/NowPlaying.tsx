import { useRef, useState } from "react";
import { Artwork } from "../components/Artwork";
import { GroupSheet } from "../components/GroupSheet";
import { Icon } from "../components/Icon";
import { RoomPicker } from "../components/RoomPicker";
import { Sheet } from "../components/Sheet";
import { Slider } from "../components/Slider";
import { formatTime } from "../lib/format";
import { paletteFromSeed } from "../lib/art";
import { imageUrl } from "../lib/images";
import {
  activeSourceLabel,
  positionFor,
  groupMembers,
  itemImage,
  itemSeed,
  itemSubtitle,
  itemTitle,
  leaderOf,
  queueFor,
  volumeLevelOf,
} from "../lib/players";
import { useTicker } from "../lib/useTicker";
import { useNav } from "../nav";
import { useApp } from "../store";
import { useVolumeStep } from "../lib/volumeStep";

const SLEEP_OPTIONS = [
  { label: "Off", seconds: 0 },
  { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1800 },
  { label: "45 min", seconds: 2700 },
  { label: "1 hour", seconds: 3600 },
];

export function NowPlaying({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const volumeStep = useVolumeStep();
  const nav = useNav();
  const player = leaderOf(app.players, app.selectedId);
  const queue = queueFor(app.players, app.queues, app.selectedId);
  const current = queue?.current_item;
  const duration = current?.duration ?? 0;
  const playing = queue?.state === "playing";
  const repeat = queue?.repeat_mode ?? "off";

  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [inputsOpen, setInputsOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const topDrag = useRef<{ y: number; offset: number } | null>(null);

  useTicker(playing);

  const elapsed = seekPreview ?? positionFor(player, queue, duration);
  const members = player ? groupMembers(player).filter((id) => app.players[id]) : [];
  const level = volumeLevelOf(player);
  const artUrl = imageUrl(itemImage(current), app.baseUrl, 1024);
  const palette = paletteFromSeed(itemSeed(current?.media_item) || player?.name || "somas");
  const mediaUri = current?.media_item?.uri ?? "";
  const isFav = mediaUri ? favs[mediaUri] ?? Boolean(current?.media_item?.favorite) : false;

  const mediaItem = current?.media_item;
  const detailItem =
    mediaItem && mediaItem.media_type === "track" && mediaItem.album ? mediaItem.album : mediaItem;

  const toggleFavorite = () => {
    if (mediaUri) {
      setFavs((prev) => ({ ...prev, [mediaUri]: !isFav }));
      void app.setFavorite(
        mediaUri,
        !isFav,
        mediaItem?.media_type ?? undefined,
        mediaItem?.item_id ?? undefined,
      );
      return;
    }
    void app
      .send("players/add_currently_playing_to_favorites", { player_id: player?.player_id })
      .then(() => app.notify("Added to favorites"))
      .catch((err: Error) => app.notify(err.message || "Could not add to favorites"));
  };

  const startTopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    topDrag.current = { y: event.clientY, offset: 0 };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer: dragging still works without capture.
    }
  };

  const moveTopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = topDrag.current;
    if (!drag) return;
    drag.offset = Math.max(0, event.clientY - drag.y);
    if (rootRef.current) rootRef.current.style.transform = `translateY(${drag.offset}px)`;
  };

  const endTopDrag = () => {
    const drag = topDrag.current;
    topDrag.current = null;
    if (!drag) return;
    if (rootRef.current) rootRef.current.style.transform = "";
    if (drag.offset > 90) onClose();
  };

  return (
    <div className="np" ref={rootRef}>
      <div
        className="np__bg"
        style={{
          backgroundImage: artUrl ? `url("${artUrl}")` : undefined,
          backgroundColor: palette.base,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="np__scrim" />

      <div className="np__content">
        <div
          className="np__top"
          onPointerDown={startTopDrag}
          onPointerMove={moveTopDrag}
          onPointerUp={endTopDrag}
          onPointerCancel={endTopDrag}
        >
          <button className="np__icon" onClick={onClose} aria-label="Close Now Playing">
            <Icon name="chevronDown" size={26} />
          </button>
          <button className="np__room" onClick={() => setRoomsOpen(true)}>
            <span>{player?.name ?? "No room"}</span>
            {members.length > 1 ? (
              <span className="np__room-tag">+{members.length - 1}</span>
            ) : null}
            <Icon name="chevronDown" size={14} />
          </button>
          <button className="np__icon" onClick={() => setMenuOpen(true)} aria-label="More options">
            <Icon name="more" size={24} />
          </button>
        </div>

        <div className="np__art">
          <Artwork
            image={itemImage(current)}
            seed={itemSeed(current?.media_item) || player?.name}
            baseUrl={app.baseUrl}
            width="100%"
            height="100%"
            radius={10}
            requestSize={1024}
            alt={itemTitle(current)}
          />
        </div>

        <div className="np__meta">
          <button
            className="np__title"
            onClick={() => {
              if (detailItem && detailItem.uri) {
                onClose();
                nav.push({ name: "media", item: detailItem });
              }
            }}
          >
            {itemTitle(current) || activeSourceLabel(player, app.providers)}
          </button>
          <div className="np__sub">{itemSubtitle(current) || (current ? "" : "Nothing playing")}</div>
          {current?.media_item?.album?.name && current.media_item.media_type === "track" ? (
            <div className="np__album">{current.media_item.album.name}</div>
          ) : null}
        </div>

        {current ? (
          <div className="np__seek">
            <Slider
              label="Playback position"
              value={Math.min(elapsed, duration || 1)}
              max={duration || 1}
              step={1}
              disabled={!duration || !queue}
              // Follow the clock per frame so the bar glides between the once-a-second updates.
              livePercent={() => {
                if (!duration) return 0;
                const position = seekPreview ?? positionFor(player, queue, duration);
                return (Math.min(position, duration) / duration) * 100;
              }}
              onChange={(value) => setSeekPreview(value)}
              onCommit={(value) => {
                if (queue) void app.seek(queue.queue_id, value);
                window.setTimeout(() => setSeekPreview(null), 400);
              }}
            />
            <div className="np__times">
              <span>{formatTime(elapsed)}</span>
              <span>-{formatTime(Math.max(0, duration - elapsed))}</span>
            </div>
          </div>
        ) : null}

        <div className="np__controls">
          <button
            className={`np__ctrl ${queue?.shuffle_enabled ? "is-on" : ""}`}
            aria-label="Shuffle"
            aria-pressed={queue?.shuffle_enabled}
            disabled={!queue}
            onClick={() => queue && void app.setShuffle(queue.queue_id, !queue.shuffle_enabled)}
          >
            <Icon name="shuffle" size={22} />
          </button>
          <button
            className="np__ctrl np__ctrl--skip"
            aria-label="Previous"
            onClick={() => app.selectedId && void app.previous(app.selectedId)}
          >
            <Icon name="prev" size={32} />
          </button>
          <button
            className="np__play"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => app.selectedId && void app.togglePlay(app.selectedId)}
          >
            <Icon name={playing ? "pause" : "play"} size={30} />
          </button>
          <button
            className="np__ctrl np__ctrl--skip"
            aria-label="Next"
            onClick={() => app.selectedId && void app.next(app.selectedId)}
          >
            <Icon name="next" size={32} />
          </button>
          <button
            className={`np__ctrl ${repeat !== "off" ? "is-on" : ""}`}
            aria-label={`Repeat: ${repeat}`}
            disabled={!queue}
            onClick={() => queue && void app.cycleRepeat(queue.queue_id)}
          >
            <Icon name={repeat === "one" ? "repeatOne" : "repeat"} size={22} />
          </button>
        </div>

        <div className="np__volume">
          <button
            className="np__icon"
            aria-label={player?.volume_muted ? "Unmute" : "Mute"}
            onClick={() => player && void app.toggleMute(player.player_id)}
          >
            <Icon
              name={
                player?.volume_muted ? "volumeMute" : level > 40 ? "volume" : "volumeLow"
              }
              size={20}
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
          <span className="np__volume-value">{Math.round(level)}</span>
        </div>

        <div className="np__actions">
          <button className="np__action" onClick={() => nav.openQueue()}>
            <Icon name="queue" size={22} />
            <span>Queue</span>
          </button>
          <button
            className="np__action"
            onClick={() => player && setGroupOpen(true)}
            disabled={!player}
          >
            <Icon name="group" size={22} />
            <span>Group</span>
          </button>
          <button
            className="np__action"
            onClick={() => setInputsOpen(true)}
            disabled={!player}
          >
            <Icon name="radio" size={22} />
            <span>{activeSourceLabel(player, app.providers)}</span>
          </button>
          <button className="np__action" onClick={toggleFavorite}>
            <Icon name={isFav ? "heartFilled" : "heart"} size={22} />
            <span>{isFav ? "Favorited" : "Favorite"}</span>
          </button>
        </div>
      </div>

      {roomsOpen ? <RoomPicker onClose={() => setRoomsOpen(false)} /> : null}
      {groupOpen && player ? (
        <GroupSheet playerId={player.player_id} onClose={() => setGroupOpen(false)} />
      ) : null}

      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={player?.name ?? "Room"}
        subtitle={player?.device_info?.model}
      >
        <div className="action-list">
          <button
            className="action"
            onClick={() => {
              setMenuOpen(false);
              onClose();
              if (player) nav.push({ name: "player", playerId: player.player_id });
            }}
          >
            <Icon name="sliders" size={20} />
            <span>Room &amp; EQ settings</span>
          </button>
          <button
            className="action"
            onClick={() => {
              setMenuOpen(false);
              setInputsOpen(true);
            }}
          >
            <Icon name="radio" size={20} />
            <span>Select input</span>
          </button>
          <button
            className="action"
            onClick={() => {
              setMenuOpen(false);
              setSleepOpen(true);
            }}
          >
            <Icon name="timer" size={20} />
            <span>Sleep timer</span>
          </button>
          <button
            className="action"
            onClick={() => {
              setMenuOpen(false);
              setGroupOpen(true);
            }}
          >
            <Icon name="group" size={20} />
            <span>Group rooms</span>
          </button>
          <button
            className="action"
            onClick={() => {
              setMenuOpen(false);
              nav.openQueue();
            }}
          >
            <Icon name="queue" size={20} />
            <span>View queue</span>
          </button>
          <button
            className="action action--danger"
            onClick={() => {
              if (queue) void app.clearQueue(queue.queue_id);
              setMenuOpen(false);
            }}
          >
            <Icon name="trash" size={20} />
            <span>Clear queue</span>
          </button>
        </div>
      </Sheet>

      <Sheet
        open={inputsOpen}
        onClose={() => setInputsOpen(false)}
        title="Select input"
        subtitle={player?.name}
      >
        <div className="rows">
          <button
            className={`row row--select ${
              queue && player?.active_source === queue.queue_id ? "is-selected" : ""
            }`}
            onClick={() => {
              if (player) {
                void app.selectSource(player.player_id, queue?.queue_id ?? player.player_id);
              }
              setInputsOpen(false);
            }}
          >
            <span className="row__art row__art--tile">
              <Icon name="music" size={22} />
            </span>
            <span className="row__body">
              <span className="row__title">Music Assistant</span>
              <span className="row__sub">Stream from your library and services</span>
            </span>
          </button>
          {(player?.source_list ?? []).map((source) => (
            <button
              key={source.id}
              className={`row row--select ${
                player?.active_source === source.id ? "is-selected" : ""
              }`}
              onClick={() => {
                if (player) void app.selectSource(player.player_id, source.id);
                setInputsOpen(false);
              }}
            >
              <span className="row__art row__art--tile">
                <Icon name={source.id === "tv" ? "tv" : source.id === "bluetooth" ? "bluetooth" : "radio"} size={22} />
              </span>
              <span className="row__body">
                <span className="row__title">{source.name}</span>
                <span className="row__sub">
                  {player?.active_source === source.id ? "Active input" : "Input"}
                </span>
              </span>
              {player?.active_source === source.id ? (
                <span className="row__check">
                  <Icon name="check" size={18} strokeWidth={2.2} />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={sleepOpen}
        onClose={() => setSleepOpen(false)}
        title="Sleep timer"
        subtitle="Stops playback after the selected time"
      >
        <div className="rows">
          {SLEEP_OPTIONS.map((option) => (
            <button
              key={option.label}
              className="row row--select"
              onClick={() => {
                if (player) void app.setSleepTimer(player.player_id, option.seconds);
                setSleepOpen(false);
              }}
            >
              <span className="row__art row__art--tile">
                <Icon name="timer" size={22} />
              </span>
              <span className="row__body">
                <span className="row__title">{option.label}</span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
