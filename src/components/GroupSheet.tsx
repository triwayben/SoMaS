import { useState } from "react";
import { Artwork } from "./Artwork";
import { DeviceArt } from "./DeviceArt";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { Slider } from "./Slider";
import { readGroupPresets, rememberGrouping, type GroupPreset } from "../lib/groupPresets";
import {
  activeSourceLabel,
  groupMembers,
  itemImage,
  itemSeed,
  itemSubtitle,
  itemTitle,
  queueFor,
  volumeLevelOf,
} from "../lib/players";
import { useApp } from "../store";

export function GroupSheet({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const app = useApp();
  const target = app.players[playerId];
  const [selected, setSelected] = useState<string[]>(() =>
    target
      ? [
          playerId,
          ...groupMembers(target).filter((id) => id !== playerId && app.players[id]),
        ]
      : [],
  );
  const [applying, setApplying] = useState(false);
  const [recent, setRecent] = useState<GroupPreset[]>(() => readGroupPresets());

  if (!target) return null;

  const members = groupMembers(target).filter((id) => id !== playerId && app.players[id]);
  const rooms = Object.values(app.players).sort((a, b) => a.name.localeCompare(b.name));
  const queue = queueFor(app.players, app.queues, playerId);
  const current = queue?.current_item;
  const level = volumeLevelOf(target);
  const muted = Boolean(target.volume_muted);

  const toggle = (id: string) => {
    if (id === playerId) return;
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id],
    );
  };

  const presets = [
    { id: "all", label: "All speakers", apply: () => rooms.map((room) => room.player_id) },
    {
      id: "current",
      label: "Current group",
      apply: () => [playerId, ...members],
    },
    { id: "only", label: "This room only", apply: () => [playerId] },
  ];

  const activePreset = presets.find((preset) => {
    const ids = preset.apply();
    return ids.length === selected.length && ids.every((id) => selected.includes(id));
  });

  // Offer saved groupings other than the one already on the speakers.
  const liveGroup = [playerId, ...members];
  const sameGroup = (ids: string[]) =>
    ids.length === liveGroup.length && ids.every((id) => liveGroup.includes(id));
  const recentChips = recent
    .map((preset) => ({
      preset,
      ids: [playerId, ...preset.members.filter((id) => id !== playerId && app.players[id])],
    }))
    .filter((entry) => entry.ids.length >= 2 && !sameGroup(entry.ids));

  const submit = async () => {
    const adds = selected.filter((id) => id !== playerId && !members.includes(id));
    const removes = members.filter((id) => !selected.includes(id));
    setApplying(true);
    try {
      if (adds.length || removes.length) {
        await app.setGroupMembers(playerId, adds, removes);
        setRecent(rememberGrouping(app.players, playerId, selected));
      }
      onClose();
    } finally {
      setApplying(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      full
      footer={
        <button
          className="group-apply__btn"
          onClick={() => void submit()}
          disabled={applying}
        >
          {applying ? "Applying…" : "Apply"}
        </button>
      }
    >
      <div className="group-sheet">
        <div className="group-now">
          <span className="group-now__art">
            {current ? (
              <Artwork
                image={itemImage(current)}
                seed={itemSeed(current.media_item) || target.name}
                baseUrl={app.baseUrl}
                radius={10}
                requestSize={256}
                alt={itemTitle(current)}
              />
            ) : (
              <Icon name="music" size={22} />
            )}
          </span>
          <span className="group-now__body">
            <span className="group-now__title">
              {current ? itemTitle(current) : target.name}
            </span>
            <span className="group-now__sub">
              {current
                ? itemSubtitle(current) || "Playing"
                : activeSourceLabel(target, app.providers)}
            </span>
          </span>
        </div>

        <div className="group-chips">
          {presets.map((preset) => (
            <button
              key={preset.id}
              className={`group-chip ${activePreset?.id === preset.id ? "is-active" : ""}`}
              onClick={() => setSelected(preset.apply())}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {recentChips.length ? (
          <div className="group-recents">
            <span className="group-recents__label">Recent groupings</span>
            <div className="group-recents__chips">
              {recentChips.map(({ preset, ids }) => (
                <button
                  key={preset.id}
                  className="group-chip group-chip--preset"
                  title={preset.name}
                  onClick={() => setSelected(ids)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="group-list">
          {rooms.map((room) => {
            const isTarget = room.player_id === playerId;
            const on = selected.includes(room.player_id);
            const roomQueue = queueFor(app.players, app.queues, room.player_id);
            const now = roomQueue?.current_item;
            const roomMembers = groupMembers(room).filter(
              (id) => id !== room.player_id && app.players[id],
            );
            const subtitle = now
              ? [itemTitle(now), itemSubtitle(now)].filter(Boolean).join(" · ")
              : (room.device_info?.model ?? "Speaker");

            const art = (
              <span className="group-row__art">
                <DeviceArt player={room} size={52} baseUrl={app.baseUrl} />
              </span>
            );

            return (
              <div key={room.player_id} className="group-row">
                {isTarget ? (
                  <div className="group-row__main">
                    {art}
                    <div className="group-row__body">
                      <span className="group-row__name">
                        {room.name}
                        {roomMembers.length ? (
                          <span className="group-row__badge">+{roomMembers.length}</span>
                        ) : null}
                      </span>
                      <div className="group-row__volume">
                        <button
                          className="group-row__mute"
                          aria-label={muted ? "Unmute" : "Mute"}
                          onClick={() => void app.toggleMute(room.player_id)}
                        >
                          <Icon
                            name={
                              muted
                                ? "volumeMute"
                                : level > 40
                                  ? "volume"
                                  : "volumeLow"
                            }
                            size={16}
                          />
                        </button>
                        <Slider
                          label={`${room.name} volume`}
                          value={level}
                          onChange={(value) => void app.setVolume(room.player_id, value)}
                          formatValue={(value) => `${Math.round(value)}%`}
                        />
                        <span className="group-row__level">{level}</span>
                      </div>
                    </div>
                    <span className="group-check is-on" aria-label="Included">
                      <Icon name="check" size={14} strokeWidth={2.8} />
                    </span>
                  </div>
                ) : (
                  <button
                    className="group-row__main"
                    onClick={() => toggle(room.player_id)}
                    disabled={room.available === false}
                    aria-pressed={on}
                    aria-label={`${on ? "Remove" : "Add"} ${room.name}`}
                  >
                    {art}
                    <span className="group-row__body">
                      <span className="group-row__name">
                        {room.name}
                        {roomMembers.length ? (
                          <span className="group-row__badge">+{roomMembers.length}</span>
                        ) : null}
                      </span>
                      <span className="group-row__sub">{subtitle}</span>
                    </span>
                    <span className={`group-check ${on ? "is-on" : ""}`}>
                      {on ? <Icon name="check" size={14} strokeWidth={2.8} /> : null}
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </Sheet>
  );
}
