import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Artwork } from "../components/Artwork";
import { DeviceArt } from "../components/DeviceArt";
import { GroupSheet } from "../components/GroupSheet";
import { Icon } from "../components/Icon";
import { EmptyState } from "../components/Media";
import { Sheet } from "../components/Sheet";
import { Slider } from "../components/Slider";
import { paletteFromSeed } from "../lib/art";
import { imageUrl } from "../lib/images";
import {
  activeSourceLabel,
  groupMembers,
  itemImage,
  itemSeed,
  itemSubtitle,
  itemTitle,
  queueFor,
  topLevelRooms,
  volumeLevelOf,
  volumeTarget,
} from "../lib/players";
import { readPref, readPrefJson, writePref, writePrefJson } from "../lib/prefs";
import { useNav } from "../nav";
import { useApp } from "../store";
import { useVolumeStep } from "../lib/volumeStep";

type SortMode = "playing" | "frequent" | "alpha";

const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: "playing", label: "Actively playing" },
  { id: "frequent", label: "Frequently used" },
  { id: "alpha", label: "Alphabetical" },
];

const SORT_KEY = "somas.sort";
const PIN_KEY = "somas.pinned";
const USAGE_KEY = "somas.usage";
const SORT_NAME = "sort";
const PIN_NAME = "pinned";
const USAGE_NAME = "usage";

function readSort(): SortMode {
  const raw = readPref(SORT_NAME, SORT_KEY);
  return raw === "frequent" || raw === "alpha" ? raw : "playing";
}

function saveSort(mode: SortMode) {
  writePref(SORT_NAME, mode);
}

function readPinned(): string[] {
  const raw = readPrefJson<string[]>(PIN_NAME, [], PIN_KEY);
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}

function savePinned(ids: string[]) {
  writePrefJson(PIN_NAME, ids);
}

function readUsage(): Record<string, number> {
  const raw = readPrefJson<Record<string, number>>(USAGE_NAME, {}, USAGE_KEY);
  return raw && typeof raw === "object" ? raw : {};
}

export function SystemScreen() {
  const app = useApp();
  const nav = useNav();
  const [sort, setSort] = useState<SortMode>(() => readSort());
  const [pinned, setPinned] = useState<string[]>(() => readPinned());
  const [usage, setUsage] = useState<Record<string, number>>(() => readUsage());
  const [sortMenu, setSortMenu] = useState<{ top: number; right: number } | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [draggingPin, setDraggingPin] = useState<string | null>(null);
  const pinRowEls = useRef<Map<string, HTMLElement>>(new Map());
  const pinPositions = useRef<Map<string, number>>(new Map());
  const draggingPinRef = useRef<string | null>(null);
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const [groupFor, setGroupFor] = useState<string | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const volumeStep = useVolumeStep();
  const rooms = topLevelRooms(Object.values(app.players));
  const providers = app.providers;

  useEffect(() => {
    const sync = () => setUsage(readUsage());
    window.addEventListener("somas:usage", sync);
    return () => window.removeEventListener("somas:usage", sync);
  }, []);

  useEffect(() => {
    if (!sortMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSortMenu(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sortMenu]);

  const chooseSort = (next: SortMode) => {
    saveSort(next);
    setSort(next);
  };

  const togglePin = (playerId: string) => {
    setPinned((prev) => {
      const next = prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId];
      savePinned(next);
      return next;
    });
  };

  const startPinDrag = (event: React.PointerEvent<HTMLButtonElement>, playerId: string) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic pointers have no capture */
    }
    draggingPinRef.current = playerId;
    setDraggingPin(playerId);
  };

  // FLIP: rows that shift out of the way slide to their new slot instead of jumping.
  useLayoutEffect(() => {
    const before = pinPositions.current;
    if (!before.size) return;
    for (const [id, element] of pinRowEls.current) {
      const start = before.get(id);
      if (start == null || id === draggingPinRef.current) continue;
      const delta = start - element.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;
      element.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
        { duration: 200, easing: "cubic-bezier(0.22, 0.9, 0.24, 1)" },
      );
    }
    pinPositions.current = new Map();
  }, [pinned]);

  const movePinDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingPin) return;
    let over: string | null = null;
    for (const [id, element] of pinRowEls.current) {
      const rect = element.getBoundingClientRect();
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
        over = id;
        break;
      }
    }
    if (!over || over === draggingPin) return;
    const target = over;
    const moving = draggingPin;
    pinPositions.current = new Map(
      [...pinRowEls.current].map(([id, element]) => [id, element.getBoundingClientRect().top]),
    );
    setPinned((prev) => {
      const next = [...prev];
      const from = next.indexOf(moving);
      const to = next.indexOf(target);
      if (from < 0 || to < 0) return prev;
      next.splice(from, 1);
      next.splice(to, 0, moving);
      savePinned(next);
      return next;
    });
  };

  const endPinDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* ignore */
    }
    draggingPinRef.current = null;
    setDraggingPin(null);
  };

  const openSortMenu = () => {
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSortMenu({
      top: rect.bottom + 10,
      right: Math.max(12, window.innerWidth - rect.right - 2),
    });
  };

  const playingRoom = (playerId: string) =>
    queueFor(app.players, app.queues, playerId)?.state === "playing";
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const pinnedRooms = pinned.flatMap((id) => rooms.filter((room) => room.player_id === id));
  const unpinnedRooms = rooms.filter((room) => !pinned.includes(room.player_id));
  const restRooms = [...unpinnedRooms];
  if (sort === "frequent") {
    restRooms.sort(
      (a, b) => (usage[b.player_id] ?? 0) - (usage[a.player_id] ?? 0) || byName(a, b),
    );
  } else if (sort === "playing") {
    restRooms.sort(
      (a, b) => Number(playingRoom(b.player_id)) - Number(playingRoom(a.player_id)) || byName(a, b),
    );
  } else {
    restRooms.sort(byName);
  }
  const orderedRooms = [...pinnedRooms, ...restRooms];

  const header = (
    <header className="syshead">
      <h1 className="syshead__title">Your System</h1>
      <div className="syshead__actions">
        <button
          ref={menuBtnRef}
          className="round-btn"
          onClick={openSortMenu}
          aria-label="Sort and pin rooms"
          aria-haspopup="menu"
          aria-expanded={Boolean(sortMenu)}
        >
          <Icon name="menu" size={22} strokeWidth={2} />
        </button>
        <button
          className="round-btn"
          onClick={() => nav.push({ name: "profile" })}
          aria-label="Profile"
        >
          <Icon name="artist" size={20} />
        </button>
        <button
          className="round-btn"
          onClick={() =>
            app.selectedId && nav.push({ name: "player", playerId: app.selectedId })
          }
          aria-label="Room settings"
          disabled={!app.selectedId}
        >
          <Icon name="gear" size={19} />
        </button>
      </div>
    </header>
  );

  if (!rooms.length) {
    return (
      <>
        {header}
        <EmptyState
          icon="speaker"
          title="No speakers found"
          body="Music Assistant reports no players. Add a player provider (Sonos, AirPlay, Chromecast…) to see your rooms here."
        />
      </>
    );
  }

  return (
    <>
      {header}

      <div className="system">
        {orderedRooms.map((room) => {
          const queue = queueFor(app.players, app.queues, room.player_id);
          const current = queue?.current_item;
          const members = groupMembers(room).filter(
            (id) => id !== room.player_id && app.players[id],
          );
          const volumePlayer = volumeTarget(app.players, room.player_id) ?? room;
          const level = volumeLevelOf(volumePlayer);
          const playing = queue?.state === "playing";
          const active = app.selectedId === room.player_id;
          const sourceLabel = activeSourceLabel(room, providers);
          const externalSource =
            Boolean(sourceLabel) &&
            !["Music Assistant", "Idle", "Unavailable"].includes(sourceLabel);
          const title = current
            ? itemTitle(current)
            : externalSource
              ? `Streaming from ${sourceLabel}`
              : "No content";
          const subtitle = current ? itemSubtitle(current) : "";
          const canPlay = Boolean(current) || externalSource;
          const queueCount = queue?.items ?? 0;
          const palette = paletteFromSeed(itemSeed(current?.media_item) || room.name);
          const artUrl = imageUrl(itemImage(current), app.baseUrl, 160);
          const openRoom = () => {
            app.selectPlayer(room.player_id);
            nav.openNowPlaying();
          };

          return (
            <article
              key={room.player_id}
              className={`roomcard ${active ? "is-active" : ""}`}
              style={
                { "--tint-a": palette.from, "--tint-b": palette.to } as CSSProperties
              }
            >
              {active && current ? (
                <span
                  className="roomcard__glow"
                  aria-hidden="true"
                  style={{
                    backgroundImage: artUrl
                      ? `url("${artUrl}")`
                      : `linear-gradient(140deg, ${palette.from}, ${palette.to})`,
                  }}
                />
              ) : null}

              <div className="roomcard__head">
                <div className="roomcard__id">
                  <h2 className="roomcard__name">{room.name}</h2>
                  {members.length ? (
                    <span className="roomcard__badge">+{members.length}</span>
                  ) : null}
                  {pinned.includes(room.player_id) ? (
                    <span className="roomcard__pin" aria-label="Pinned">
                      <Icon name="pin" size={14} />
                    </span>
                  ) : null}
                </div>
                {active ? <span className="roomcard__pct">{level}%</span> : null}
                <button
                  className="roomcard__more"
                  aria-label={`${room.name} options`}
                  onClick={() => {
                    app.selectPlayer(room.player_id);
                    setOptionsFor(room.player_id);
                  }}
                >
                  <Icon name="more" size={20} />
                </button>
              </div>

              <div className="roomcard__now">
                <button
                  className="roomcard__art"
                  onClick={openRoom}
                  aria-label={current ? `Now playing in ${room.name}` : `${room.name}`}
                >
                  {current ? (
                    <Artwork
                      image={itemImage(current)}
                      seed={itemSeed(current?.media_item) || room.name}
                      baseUrl={app.baseUrl}
                      radius={12}
                      requestSize={256}
                      alt={title}
                    />
                  ) : (
                    <Icon name="music" size={28} />
                  )}
                </button>

                <button className="roomcard__meta" onClick={openRoom}>
                  <span className="roomcard__title">{title}</span>
                  {subtitle ? <span className="roomcard__sub">{subtitle}</span> : null}
                </button>

                <button
                  className="roomcard__queue"
                  aria-label={`${room.name} queue, ${queueCount} items`}
                  onClick={() => {
                    app.selectPlayer(room.player_id);
                    nav.openQueue();
                  }}
                >
                  <Icon name="queue" size={20} />
                  {queueCount > 0 ? (
                    <span className="roomcard__count">
                      {queueCount > 99 ? "99+" : queueCount}
                    </span>
                  ) : null}
                </button>

                <button
                  className="roomcard__play"
                  disabled={!canPlay}
                  aria-label={playing ? `Pause ${room.name}` : `Play ${room.name}`}
                  onClick={() => {
                    app.selectPlayer(room.player_id);
                    void app.togglePlay(room.player_id);
                  }}
                >
                  <Icon name={playing ? "pause" : "play"} size={20} />
                </button>
              </div>

              <div className="roomcard__volume">
                <button
                  className="roomcard__mute"
                  aria-label={volumePlayer.volume_muted ? "Unmute" : "Mute"}
                  onClick={() => void app.toggleMute(volumePlayer.player_id)}
                >
                  <Icon
                    name={
                      volumePlayer.volume_muted
                        ? "volumeMute"
                        : level > 40
                          ? "volume"
                          : "volumeLow"
                    }
                    size={18}
                  />
                </button>
                <Slider
                  label={`${room.name} volume`}
                  value={level}
                  large
                  tapStep={volumeStep}
                  onChange={(value) => void app.setVolume(volumePlayer.player_id, value)}
                  formatValue={(value) => `${Math.round(value)}%`}
                />
                <span className="roomcard__level">{level}</span>
              </div>
            </article>
          );
        })}
      </div>

      <p className="footnote">
        Rooms and groups come from Music Assistant. Playback, volume and grouping here change your
        real speakers.
      </p>

      {sortMenu ? (
        <>
          <button
            className="popscrim"
            aria-label="Close menu"
            onClick={() => setSortMenu(null)}
          />
          <div
            className="sortmenu"
            style={{ top: sortMenu.top, right: sortMenu.right }}
            role="menu"
            aria-label="Sort rooms"
          >
            {SORT_OPTIONS.map((entry) => (
              <button
                key={entry.id}
                className="sortmenu__item"
                role="menuitemradio"
                aria-checked={sort === entry.id}
                onClick={() => {
                  chooseSort(entry.id);
                  setSortMenu(null);
                }}
              >
                <span className="sortmenu__check">
                  {sort === entry.id ? (
                    <Icon name="check" size={19} strokeWidth={2.4} />
                  ) : null}
                </span>
                <span>{entry.label}</span>
              </button>
            ))}
            <div className="sortmenu__divider" />
            <button
              className="sortmenu__item"
              role="menuitem"
              onClick={() => {
                setSortMenu(null);
                setPinOpen(true);
              }}
            >
              <span className="sortmenu__check">
                <Icon name="pin" size={19} />
              </span>
              <span>Pin</span>
            </button>
          </div>
        </>
      ) : null}

      <Sheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Pin rooms"
        subtitle={
          pinned.length
            ? "Drag the pinned rooms to change their order"
            : "Pin a room to keep it at the top"
        }
      >
        {pinnedRooms.length ? (
          <>
            <div className="sheet__label">Pinned</div>
            <div className="rows">
              {pinnedRooms.map((room) => (
                <div
                  key={room.player_id}
                  ref={(element) => {
                    if (element) pinRowEls.current.set(room.player_id, element);
                    else pinRowEls.current.delete(room.player_id);
                  }}
                  className={`row pin-row ${
                    draggingPin === room.player_id ? "is-dragging" : ""
                  }`}
                >
                  <button
                    className="pin-grip"
                    aria-label={`Reorder ${room.name}`}
                    onPointerDown={(event) => startPinDrag(event, room.player_id)}
                    onPointerMove={movePinDrag}
                    onPointerUp={endPinDrag}
                    onPointerCancel={endPinDrag}
                  >
                    <Icon name="drag" size={18} />
                  </button>
                  <div className="row__main">
                    <span className="row__art">
                      <DeviceArt player={room} size={52} baseUrl={app.baseUrl} />
                    </span>
                    <span className="row__body">
                      <span className="row__title">{room.name}</span>
                      <span className="row__sub">
                        {room.device_info?.model ?? "Speaker"}
                      </span>
                    </span>
                  </div>
                  <button
                    className="switch is-on"
                    role="switch"
                    aria-checked
                    aria-label={`Unpin ${room.name}`}
                    onClick={() => togglePin(room.player_id)}
                  >
                    <span className="switch__knob">
                      <Icon name="check" size={12} strokeWidth={2.4} />
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {unpinnedRooms.length ? (
          <>
            <div className="sheet__label">All rooms</div>
            <div className="rows">
              {unpinnedRooms.map((room) => (
                <div className="row" key={room.player_id}>
                  <div className="row__main">
                    <span className="row__art">
                      <DeviceArt player={room} size={52} baseUrl={app.baseUrl} />
                    </span>
                    <span className="row__body">
                      <span className="row__title">{room.name}</span>
                      <span className="row__sub">
                        {room.device_info?.model ?? "Speaker"}
                      </span>
                    </span>
                  </div>
                  <button
                    className="switch"
                    role="switch"
                    aria-checked={false}
                    aria-label={`Pin ${room.name}`}
                    onClick={() => togglePin(room.player_id)}
                  >
                    <span className="switch__knob" />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <p className="sheet__hint">
          Pinned rooms stay at the top of the list in this order, whichever sort you choose.
        </p>
      </Sheet>

      {optionsFor ? (
        <RoomSheet
          playerId={optionsFor}
          onClose={() => setOptionsFor(null)}
          onGroup={() => {
            const playerId = optionsFor;
            setOptionsFor(null);
            setGroupFor(playerId);
          }}
        />
      ) : null}

      {groupFor ? <GroupSheet playerId={groupFor} onClose={() => setGroupFor(null)} /> : null}
    </>
  );
}

function RoomSheet({
  playerId,
  onClose,
  onGroup,
}: {
  playerId: string;
  onClose: () => void;
  onGroup: () => void;
}) {
  const app = useApp();
  const nav = useNav();
  const room = app.players[playerId];
  if (!room) return null;

  const queue = queueFor(app.players, app.queues, playerId);
  const members = groupMembers(room).filter((id) => id !== playerId && app.players[id]);
  const sources = (room.source_list ?? []).filter((source) => !source.passive);
  const queueId = queue?.queue_id ?? playerId;

  return (
    <Sheet
      open
      onClose={onClose}
      title={room.name}
      subtitle={room.device_info?.model ?? activeSourceLabel(room, app.providers)}
    >
      <div className="roomsheet">
        <button
          className="roomsheet__row"
          onClick={() => {
            onClose();
            app.selectPlayer(playerId);
            nav.openNowPlaying();
          }}
        >
          <Icon name="music" size={19} />
          <span>Now playing</span>
          <Icon name="chevronRight" size={17} />
        </button>
        <button
          className="roomsheet__row"
          onClick={() => {
            onClose();
            app.selectPlayer(playerId);
            nav.openQueue();
          }}
        >
          <Icon name="queue" size={19} />
          <span>Queue</span>
          <span className="roomsheet__value">{queue?.items ?? 0} items</span>
          <Icon name="chevronRight" size={17} />
        </button>
        <button className="roomsheet__row" onClick={onGroup}>
          <Icon name="group" size={19} />
          <span>Group with…</span>
          {members.length ? (
            <span className="roomsheet__value">+{members.length}</span>
          ) : null}
          <Icon name="chevronRight" size={17} />
        </button>
        <button
          className="roomsheet__row"
          onClick={() => {
            onClose();
            nav.push({ name: "player", playerId });
          }}
        >
          <Icon name="sliders" size={19} />
          <span>Room settings</span>
          <Icon name="chevronRight" size={17} />
        </button>
      </div>

      {sources.length ? (
        <>
          <div className="sheet__label">Input</div>
          <div className="chips chips--inline">
            <button
              className={`chip chip--sm ${
                room.active_source === queueId ? "is-active" : ""
              }`}
              onClick={() => void app.selectSource(playerId, queueId)}
            >
              Music Assistant
            </button>
            {sources.map((source) => (
              <button
                key={source.id}
                className={`chip chip--sm ${
                  room.active_source === source.id ? "is-active" : ""
                }`}
                onClick={() => void app.selectSource(playerId, source.id)}
              >
                {source.name}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {members.length ? (
        <>
          <div className="sheet__label">In this group</div>
          <div className="rows">
            {members.map((id) => (
              <div className="row" key={id}>
                <div className="row__main">
                  <span className="row__body">
                    <span className="row__title">{app.players[id].name}</span>
                  </span>
                </div>
                <button
                  className="text-btn text-btn--danger"
                  onClick={() => void app.setGroupMembers(playerId, [], [id])}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Sheet>
  );
}
