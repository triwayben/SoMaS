import { useState } from "react";
import { Icon } from "../components/Icon";
import { Section } from "../components/Media";
import { TopBar } from "../components/TopBar";
import { useNav } from "../nav";
import { useApp } from "../store";
import { copyText } from "../lib/clipboard";
import { exportPrefs, importPrefs } from "../lib/prefs";
import { saveVolumeStep, useVolumeStep } from "../lib/volumeStep";
import { THEME_FAMILIES, themesIn } from "../lib/themes";
import { useTheme } from "../theme";



export function SettingsScreen() {
  const app = useApp();
  const nav = useNav();
  const theme = useTheme();
  const volumeStep = useVolumeStep();
  const [syncing, setSyncing] = useState(false);

  const musicProviders = app.providers.filter((provider) => provider.type === "music");
  const playerProviders = app.providers.filter((provider) => provider.type === "player");
  const roomCount = Object.keys(app.players).length;

  const copyLayout = async () => {
    const copied = await copyText(exportPrefs());
    app.notify(copied ? "Layout copied" : "Could not copy the layout");
  };

  const restoreLayout = async () => {
    let text = "";
    try {
      text = (await navigator.clipboard?.readText?.()) ?? "";
    } catch {
      // Reading the clipboard needs HTTPS; fall back to pasting it by hand.
      text = "";
    }
    if (!text.trim()) text = window.prompt("Paste the copied layout") ?? "";
    if (!text.trim()) return;
    const restored = importPrefs(text);
    if (!restored) {
      app.notify("That does not look like a saved layout");
      return;
    }
    app.notify(`Restored ${restored} settings`);
    window.setTimeout(() => window.location.reload(), 700);
  };

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
        <div className="theme-system">
          <button
            className={`theme-option ${theme.mode === "system" ? "is-active" : ""}`}
            onClick={() => theme.setMode("system")}
            aria-pressed={theme.mode === "system"}
          >
            <span className="theme-swatch theme-swatch--system" aria-hidden="true" />
            Match the system
          </button>
        </div>
        {THEME_FAMILIES.map((family) => (
          <div className="theme-group" key={family}>
            <p className="theme-group__label">{family}</p>
            <div className="theme-grid">
              {themesIn(family).map((option) => {
                const active = theme.mode === option.id;
                return (
                  <button
                    key={option.id}
                    className={`theme-option ${active ? "is-active" : ""}`}
                    onClick={() => theme.setMode(option.id)}
                    aria-pressed={active}
                  >
                    <span
                      className="theme-swatch"
                      style={{ background: option.background }}
                      aria-hidden="true"
                    >
                      <i style={{ background: option.accent }} />
                    </span>
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Layout">
        <div className="panel">
          <div className="panel__row">
            <span className="panel__label panel__label--stack">
              Pinned rooms, service order, sort and theme
              <span className="panel__sublabel">
                Saved on this device. Copy them before switching address, or to move them into the
                installed app.
              </span>
            </span>
          </div>
        </div>
        <div className="button-row">
          <button className="btn btn--ghost" onClick={() => void copyLayout()}>
            Copy layout
          </button>
          <button className="btn btn--ghost" onClick={() => void restoreLayout()}>
            Restore layout
          </button>
        </div>
      </Section>

      <Section title="Volume">
        <div className="panel">
          <div className="panel__row panel__row--wrap">
            <span className="panel__label">Tap step</span>
            <div className="chips chips--wrap">
              {Array.from({ length: 10 }, (_, index) => index + 1).map((step) => (
                <button
                  key={step}
                  className={`chip ${volumeStep === step ? "is-active" : ""}`}
                  onClick={() => saveVolumeStep(step)}
                >
                  {step}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="panel__hint">
          Tapping a volume bar moves it by {volumeStep} {volumeStep === 1 ? "step" : "steps"}. Dragging
          still sets the level directly.
        </p>
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
            <span className="panel__value panel__value--text">SoMaS — Sonos-style controller</span>
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
