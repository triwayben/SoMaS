import { useCallback, useEffect, useState } from "react";
import { Artwork } from "../components/Artwork";
import { Icon } from "../components/Icon";
import { EmptyState, Section } from "../components/Media";
import { Slider } from "../components/Slider";
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
import { useVolumeStep } from "../lib/volumeStep";

const SLEEP = [
  { label: "Off", seconds: 0 },
  { label: "15m", seconds: 900 },
  { label: "30m", seconds: 1800 },
  { label: "1h", seconds: 3600 },
];

const CLOCK_FORMAT: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

function clockLabel(at: number): string {
  return new Date(at * 1000).toLocaleTimeString([], CLOCK_FORMAT);
}

function durationLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

/** Seconds from now until the next time the clock reads `value` (today or tomorrow). */
function secondsUntilClock(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
  return Math.round((target.getTime() - Date.now()) / 1000);
}

const LAST_SLEEP_KEY = "sonos4ma.sleepCustom";

function readLastSleepSeconds(): number | null {
  const stored = Number(localStorage.getItem(LAST_SLEEP_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : null;
}

/** Compact chip label, e.g. 45m, 2h or 1h 30m. */
function shortDuration(seconds: number): string {
  const total = Math.round(seconds / 60);
  if (total < 60) return `${total}m`;
  if (total % 60 === 0) return `${total / 60}h`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function defaultClockValue(): string {
  const target = new Date(Date.now() + 30 * 60_000);
  target.setMinutes(Math.ceil(target.getMinutes() / 5) * 5, 0, 0);
  return `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;
}

/** Every setting the connected player exposes: volume, sound, inputs, timer, group, device. */
export function PlayerSettingsContent({
  playerId,
  showHero = true,
}: {
  playerId: string;
  showHero?: boolean;
}) {
  const app = useApp();
  const volumeStep = useVolumeStep();
  const player = app.players[playerId];
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [mode, setMode] = useState<"duration" | "clock">("duration");
  const [minutes, setMinutes] = useState(() =>
    Math.max(1, Math.round((readLastSleepSeconds() ?? 45 * 60) / 60)),
  );
  const [clock, setClock] = useState(defaultClockValue);
  const [lastCustom, setLastCustom] = useState<number | null>(() => readLastSleepSeconds());

  const refreshTimer = useCallback(async () => {
    try {
      const value = await app.send<number | null>("players/sleep_timer/get", {
        player_id: playerId,
      });
      setExpiresAt(typeof value === "number" ? value : null);
    } catch {
      /* servers before the sleep timer command simply have no timer */
    }
  }, [app.send, playerId]);

  useEffect(() => {
    void refreshTimer();
  }, [refreshTimer]);

  useEffect(() => {
    if (!player) return;
    setExpiresAt(
      typeof player.sleep_timer_expires_at === "number" ? player.sleep_timer_expires_at : null,
    );
  }, [player]);

  const applyTimer = async (seconds: number) => {
    await app.setSleepTimer(playerId, seconds);
    await refreshTimer();
    if (seconds > 0) setCustomOpen(false);
  };

  const applyCustom = async (seconds: number) => {
    localStorage.setItem(LAST_SLEEP_KEY, String(seconds));
    setLastCustom(seconds);
    await applyTimer(seconds);
  };

  if (!player) {
    return (
      <EmptyState
        icon="offline"
        title="Room not available"
        body="This player is no longer connected."
      />
    );
  }

  const queue = queueFor(app.players, app.queues, playerId);
  const current = queue?.current_item;
  const members = groupMembers(player).filter((id) => id !== playerId && app.players[id]);
  const level = volumeLevelOf(player);
  const customSeconds =
    mode === "duration" ? Math.round(minutes * 60) : secondsUntilClock(clock);
  const customSummary =
    customSeconds <= 0
      ? "Pick a time"
      : mode === "clock"
        ? `Stops in ${durationLabel(customSeconds)}`
        : `Stops at ${clockLabel(Math.floor(Date.now() / 1000) + customSeconds)}`;

  return (
    <>
      {showHero ? (
        <div className="player-hero">
          <Artwork
            image={itemImage(current)}
            seed={itemSeed(current?.media_item) || player.name}
            baseUrl={app.baseUrl}
            radius={10}
            width={92}
            height={92}
            requestSize={512}
            alt={player.name}
          />
          <div className="player-hero__body">
            <div className="player-hero__name">{player.name}</div>
            <div className="player-hero__sub">
              {current ? itemTitle(current) : activeSourceLabel(player, app.providers)}
            </div>
            {current ? <div className="player-hero__sub2">{itemSubtitle(current)}</div> : null}
          </div>
        </div>
      ) : null}

      <Section title="Volume">
        <div className="panel">
          <div className="panel__row panel__row--volume">
            <button
              className="icon-btn"
              aria-label={player.volume_muted ? "Unmute" : "Mute"}
              onClick={() => void app.toggleMute(playerId)}
            >
              <Icon
                name={player.volume_muted ? "volumeMute" : level > 40 ? "volume" : "volumeLow"}
                size={20}
              />
            </button>
            <Slider
              label={`${player.name} volume`}
              value={level}
              large
              tapStep={volumeStep}
              onChange={(value) => void app.setVolume(playerId, value)}
            />
            <span className="panel__value">{Math.round(level)}</span>
          </div>
          {members.length ? (
            <p className="panel__hint">
              Grouped with {members.map((id) => app.players[id].name).join(", ")} — this slider sets
              the group volume.
            </p>
          ) : null}
        </div>
      </Section>

      {player.sound_mode_list?.length ? (
        <Section title="Sound mode">
          <div className="chips chips--wrap">
            {player.sound_mode_list
              .filter((mode) => !mode.passive)
              .map((mode) => (
                <button
                  key={mode.id}
                  className={`chip ${player.active_sound_mode === mode.id ? "is-active" : ""}`}
                  onClick={() => void app.selectSoundMode(playerId, mode.id)}
                >
                  {mode.name}
                </button>
              ))}
          </div>
        </Section>
      ) : null}

      {player.options?.length ? (
        <Section title="Sound & behaviour">
          <div className="panel">
            {player.options.map((option) => {
              if (option.read_only) return null;
              if (option.type === "boolean") {
                return (
                  <div className="panel__row" key={option.key}>
                    <span className="panel__label">{option.name}</span>
                    <button
                      className={`switch ${option.value ? "is-on" : ""}`}
                      role="switch"
                      aria-checked={Boolean(option.value)}
                      aria-label={option.name}
                      onClick={() => void app.setOption(playerId, option.key, !option.value)}
                    >
                      <span className="switch__knob" />
                    </button>
                  </div>
                );
              }
              if (
                (option.type === "integer" || option.type === "float") &&
                option.min_value != null &&
                option.max_value != null
              ) {
                return (
                  <div className="panel__row panel__row--slider" key={option.key}>
                    <span className="panel__label">{option.name}</span>
                    <Slider
                      label={option.name}
                      value={Number(option.value)}
                      min={option.min_value}
                      max={option.max_value}
                      step={option.step ?? 1}
                      onChange={(value) => void app.setOption(playerId, option.key, value)}
                    />
                    <span className="panel__value">{String(option.value)}</span>
                  </div>
                );
              }
              if (option.options?.length) {
                return (
                  <div className="panel__row panel__row--wrap" key={option.key}>
                    <span className="panel__label">{option.name}</span>
                    <div className="chips chips--inline">
                      {option.options.map((entry) => (
                        <button
                          key={entry.key}
                          className={`chip chip--sm ${
                            entry.value === option.value ? "is-active" : ""
                          }`}
                          onClick={() => void app.setOption(playerId, option.key, entry.value)}
                        >
                          {entry.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </Section>
      ) : null}

      {player.source_list?.length ? (
        <Section title="Inputs">
          <div className="chips chips--wrap">
            <button
              className={`chip ${player.active_source === playerId ? "is-active" : ""}`}
              onClick={() => void app.selectSource(playerId, queue?.queue_id ?? playerId)}
            >
              Music Assistant
            </button>
            {player.source_list
              .filter((source) => !source.passive)
              .map((source) => (
                <button
                  key={source.id}
                  className={`chip ${player.active_source === source.id ? "is-active" : ""}`}
                  onClick={() => void app.selectSource(playerId, source.id)}
                >
                  {source.name}
                </button>
              ))}
          </div>
        </Section>
      ) : null}

      <Section title="Sleep timer">
        {expiresAt ? (
          <p className="sleep-status">
            Stops at {clockLabel(expiresAt)} · in {durationLabel(expiresAt - Date.now() / 1000)}
          </p>
        ) : null}
        <div className="chips chips--wrap">
          {SLEEP.map((option) => (
            <button
              key={option.label}
              className={`chip ${option.seconds === 0 && !expiresAt ? "is-active" : ""}`}
              onClick={() => void applyTimer(option.seconds)}
            >
              {option.label}
            </button>
          ))}
          {lastCustom && !SLEEP.some((option) => option.seconds === lastCustom) ? (
            <button
              className="chip"
              title="Your last custom duration"
              onClick={() => void applyTimer(lastCustom)}
            >
              {shortDuration(lastCustom)}
            </button>
          ) : null}
          <button
            className={`chip ${customOpen ? "is-active" : ""}`}
            onClick={() => setCustomOpen((open) => !open)}
          >
            Custom…
          </button>
        </div>

        {customOpen ? (
          <div className="sleep-block">
            <div className="sleep-panel">
              <div className="sleep-panel__modes">
                <button
                  className={`chip chip--sm ${mode === "duration" ? "is-active" : ""}`}
                  onClick={() => setMode("duration")}
                >
                  After a while
                </button>
                <button
                  className={`chip chip--sm ${mode === "clock" ? "is-active" : ""}`}
                  onClick={() => setMode("clock")}
                >
                  At a set time
                </button>
              </div>
              {mode === "duration" ? (
                <div className="sleep-panel__row">
                  <span className="sleep-panel__label">Stop after</span>
                  <input
                    className="sleep-input"
                    type="number"
                    min={1}
                    max={720}
                    inputMode="numeric"
                    value={minutes}
                    aria-label="Minutes until playback stops"
                    onChange={(event) =>
                      setMinutes(Math.max(1, Math.min(720, Number(event.target.value) || 1)))
                    }
                  />
                  <span className="sleep-panel__label">min</span>
                </div>
              ) : (
                <div className="sleep-panel__row">
                  <span className="sleep-panel__label">Stop at</span>
                  <input
                    className="sleep-input"
                    type="time"
                    value={clock}
                    aria-label="Time playback stops"
                    onChange={(event) => setClock(event.target.value)}
                  />
                </div>
              )}
              <div className="sleep-panel__row sleep-panel__row--between">
                <span className="sleep-panel__summary">{customSummary}</span>
                <button
                  className="sleep-panel__apply"
                  onClick={() => void applyCustom(customSeconds)}
                  disabled={customSeconds <= 0}
                >
                  {expiresAt ? "Update" : "Start"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </Section>

      {members.length ? (
        <Section title="Group">
          <div className="panel">
            {members.map((id) => (
              <div className="panel__row" key={id}>
                <span className="panel__label">{app.players[id].name}</span>
                <button
                  className="text-btn text-btn--danger"
                  onClick={() => void app.setGroupMembers(playerId, [], [id])}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Device">
        <div className="panel">
          <div className="panel__row">
            <span className="panel__label">Model</span>
            <span className="panel__value panel__value--text">
              {player.device_info?.model ?? "—"}
            </span>
          </div>
          <div className="panel__row">
            <span className="panel__label">Manufacturer</span>
            <span className="panel__value panel__value--text">
              {player.device_info?.manufacturer ?? "—"}
            </span>
          </div>
          <div className="panel__row">
            <span className="panel__label">Software</span>
            <span className="panel__value panel__value--text">
              {player.device_info?.software_version ?? "—"}
            </span>
          </div>
          <div className="panel__row">
            <span className="panel__label">Player ID</span>
            <span className="panel__value panel__value--text panel__value--mono">
              {player.player_id}
            </span>
          </div>
        </div>
      </Section>

      {app.baseUrl && app.backendKind === "mas" ? (
        <a
          className="link-row"
          href={`${app.baseUrl}/settings/player/${encodeURIComponent(player.player_id)}`}
          target="_blank"
          rel="noreferrer"
        >
          <span>Open this player in Music Assistant</span>
          <Icon name="external" size={18} />
        </a>
      ) : null}
    </>
  );
}
