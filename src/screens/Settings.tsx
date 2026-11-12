import { useState } from "react";
import { Icon } from "../components/Icon";
import { Section } from "../components/Media";
import { TopBar } from "../components/TopBar";
import { useNav } from "../nav";
import { useApp } from "../store";
import { useTheme, type ThemeMode } from "../theme";

const THEMES: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsScreen() {
  const app = useApp();
  const nav = useNav();
  const theme = useTheme();
  const [syncing, setSyncing] = useState(false);

  const musicProviders = app.providers.filter((provider) => provider.type === "music");
  const playerProviders = app.providers.filter((provider) => provider.type === "player");
  const roomCount = Object.keys(app.players).length;

  const syncLibrary = async () => {
    setSyncing(true);
    try {
      await app.send("music/sync", {});
      app.notify("Library scan started");
    } catch (err) {
      app.notify((err as Error).message || "Could not start a scan");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <TopBar title="Settings" onBack={nav.back} />

      <Section title="Appearance">
        <div className="segmented">
          {THEMES.map((option) => (
            <button
              key={option.value}
              className={`segmented__item ${theme.mode === option.value ? "is-active" : ""}`}
              onClick={() => theme.setMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Connection">
        <div className="panel">
          <div className="panel__row">
            <span className="panel__label">Server</span>
            <span className="panel__value panel__value--text">
              {app.backendKind === "demo" ? "Demo system" : app.baseUrl.replace(/^https?:\/\//, "")}
            </span>
          </div>
          <div className="panel__row">
            <span className="panel__label">Music Assistant</span>
            <span className="panel__value panel__value--text">
              {String(app.serverInfo?.server_version ?? "Unknown")}
            </span>
          </div>
          <div className="panel__row">
            <span className="panel__label">Schema</span>
            <span className="panel__value panel__value--text">
              {app.serverInfo?.schema_version != null ? String(app.serverInfo.schema_version) : "—"}
            </span>
          </div>
          <div className="panel__row">
            <span className="panel__label">Status</span>
            <span className="panel__value panel__value--text">
              {app.connState === "connected" ? "Connected" : app.connState}
            </span>
          </div>
        </div>
        <div className="button-row">
          {app.backendKind === "mas" ? (
            <button className="btn btn--ghost" onClick={() => void syncLibrary()} disabled={syncing}>
              <Icon name="refresh" size={18} />
              {syncing ? "Scanning…" : "Scan library"}
            </button>
          ) : null}
          <button className="btn btn--ghost btn--danger" onClick={app.disconnect}>
            Disconnect
          </button>
        </div>
      </Section>

      <Section title="Music sources">
        <div className="panel">
          {musicProviders.length === 0 ? (
            <div className="panel__row">
              <span className="panel__label">No music providers</span>
            </div>
          ) : (
            musicProviders.map((provider) => (
              <div className="panel__row" key={provider.instance_id}>
                <span className="panel__label panel__label--stack">
                  <span>{provider.name}</span>
                  <span className="panel__sublabel">{provider.instance_id}</span>
                </span>
                <span
                  className={`status ${provider.available === false ? "status--off" : "status--on"}`}
                >
                  {provider.available === false ? "Unavailable" : "Connected"}
                </span>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="Speakers">
        <div className="panel">
          <div className="panel__row">
            <span className="panel__label">Rooms</span>
            <span className="panel__value">{roomCount}</span>
          </div>
          {playerProviders.map((provider) => (
            <div className="panel__row" key={provider.instance_id}>
              <span className="panel__label">{provider.name}</span>
              <span
                className={`status ${provider.available === false ? "status--off" : "status--on"}`}
              >
                {provider.available === false ? "Offline" : "Active"}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="About">
        <div className="panel">
          <div className="panel__row">
            <span className="panel__label">Interface</span>
            <span className="panel__value panel__value--text">Sonos-style web controller</span>
          </div>
          <div className="panel__row">
            <span className="panel__label">Music backend</span>
            <span className="panel__value panel__value--text">Music Assistant</span>
          </div>
        </div>
        {app.baseUrl && app.backendKind === "mas" ? (
          <a className="link-row" href={app.baseUrl} target="_blank" rel="noreferrer">
            <span>Open Music Assistant</span>
            <Icon name="external" size={18} />
          </a>
        ) : null}
      </Section>

      <p className="footnote">
        Playback, rooms, sources and library data all come live from Music Assistant over its
        websocket API.
      </p>
    </>
  );
}
