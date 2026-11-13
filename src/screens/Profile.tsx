import { useEffect, useMemo, useState } from "react";
import type { ItemMapping } from "../api/types";
import { Icon } from "../components/Icon";
import { Section } from "../components/Media";
import { TopBar } from "../components/TopBar";
import { useNav } from "../nav";
import { STORAGE, useApp } from "../store";

function readUsage(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE.usage) ?? "{}");
    return raw && typeof raw === "object" ? (raw as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function ProfileScreen() {
  const app = useApp();
  const nav = useNav();
  const [usage, setUsage] = useState<Record<string, number>>(() => readUsage());
  const [tracksPlayed, setTracksPlayed] = useState<number | null>(null);

  const demo = app.backendKind === "demo";
  const server = demo ? "Demo system" : app.baseUrl.replace(/^https?:\/\//, "");
  const rooms = Object.keys(app.players).length;
  const sources = app.providers.filter((provider) => provider.type === "music").length;
  const connected = app.connState === "connected";

  useEffect(() => {
    const sync = () => setUsage(readUsage());
    window.addEventListener("somas:usage", sync);
    return () => window.removeEventListener("somas:usage", sync);
  }, []);

  // Music Assistant keeps a per-user history of played items; ask it for tracks and
  // fall back to filtering the unfiltered list on servers that ignore media_types.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const filtered = await app.send<ItemMapping[]>("music/recently_played_items", {
          limit: 500,
          media_types: ["track"],
        });
        let tracks = (filtered ?? []).filter((item) => item.media_type === "track");
        if (!tracks.length) {
          const all = await app.send<ItemMapping[]>("music/recently_played_items", { limit: 500 });
          tracks = (all ?? []).filter((item) => item.media_type === "track");
        }
        if (cancelled) return;
        setTracksPlayed(new Set(tracks.map((track) => track.uri ?? track.item_id ?? track.name)).size);
      } catch {
        if (!cancelled) setTracksPlayed(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [app.send]);

  const usageRooms = useMemo(
    () =>
      Object.entries(usage)
        .map(([playerId, count]) => ({ playerId, count, name: app.players[playerId]?.name ?? "" }))
        .filter((room) => room.count > 0 && room.name)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    [usage, app.players],
  );

  const topRooms = usageRooms.slice(0, 5);
  const peak = usageRooms[0]?.count ?? 1;

  return (
    <>
      <TopBar title="Profile" onBack={nav.back} />

      <div className="profile-hero">
        <span className="profile-hero__avatar">
          <Icon name="artist" size={30} strokeWidth={1.5} />
        </span>
        <div className="profile-hero__body">
          <h1 className="profile-hero__name">Music Assistant</h1>
          <p className="profile-hero__sub">{server}</p>
          <p className="profile-hero__state">
            <span className={`profile-hero__dot ${connected ? "is-on" : ""}`} />
            {connected ? "Connected" : app.connState}
          </p>
        </div>
      </div>

      <Section title="Listening">
        <div className="listen-stats">
          <div className="listen-stat">
            <span className="listen-stat__value">
              {tracksPlayed === null ? "—" : tracksPlayed.toLocaleString()}
            </span>
            <span className="listen-stat__label">Tracks played</span>
            <span className="listen-stat__hint">From your listening history</span>
          </div>
          <div className="listen-stat">
            <span className="listen-stat__value">{usageRooms.length}</span>
            <span className="listen-stat__label">Rooms used</span>
            <span className="listen-stat__hint">Picked on this device</span>
          </div>
        </div>
      </Section>

      <Section title="Rooms you use most">
        <div className="panel">
          {topRooms.length ? (
            topRooms.map((room) => (
              <div className="usage-row" key={room.playerId}>
                <div className="usage-row__head">
                  <span className="panel__label">{room.name}</span>
                  <span className="usage-row__count">
                    {room.count} {room.count === 1 ? "play" : "plays"}
                  </span>
                </div>
                <span className="usage-row__track">
                  <span
                    className="usage-row__fill"
                    style={{ width: `${Math.max(8, Math.round((room.count / peak) * 100))}%` }}
                  />
                </span>
              </div>
            ))
          ) : (
            <p className="usage-empty">
              Choose a room on the System tab and your most-used rooms will collect here.
            </p>
          )}
        </div>
      </Section>

      <Section title="Account">
        <div className="panel">
          <div className="panel__row">
            <span className="panel__label">Server</span>
            <span className="panel__value panel__value--text">{server}</span>
          </div>
          <div className="panel__row">
            <span className="panel__label">Music Assistant</span>
            <span className="panel__value panel__value--text">
              {String(app.serverInfo?.server_version ?? "Unknown")}
            </span>
          </div>
          <div className="panel__row">
            <span className="panel__label">Mode</span>
            <span className="panel__value panel__value--text">
              {demo ? "Demo data" : "Live server"}
            </span>
          </div>
          <div className="panel__row">
            <span className="panel__label">Rooms</span>
            <span className="panel__value">{rooms}</span>
          </div>
          <div className="panel__row">
            <span className="panel__label">Music sources</span>
            <span className="panel__value">{sources}</span>
          </div>
        </div>
        <div className="button-row">
          <button className="btn btn--ghost" onClick={() => nav.push({ name: "settings" })}>
            <Icon name="gear" size={18} />
            App settings
          </button>
          <button className="btn btn--ghost btn--danger" onClick={app.disconnect}>
            {demo ? "Leave demo" : "Disconnect"}
          </button>
        </div>
      </Section>

      <p className="footnote">
        Your profile is the Music Assistant server this browser is connected to. The access token
        stays in this browser and is never sent anywhere else.
      </p>
    </>
  );
}
