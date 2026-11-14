import { useState } from "react";
import { Icon } from "../components/Icon";
import { Section } from "../components/Media";
import { Sheet } from "../components/Sheet";
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
  // Copying settings to another address: one sheet holds the text either way, so restoring never
  // depends on reading the clipboard, which a phone can block.
  const [move, setMove] = useState<"copy" | "paste" | null>(null);
  const [exported, setExported] = useState("");
  const [draft, setDraft] = useState("");

  const musicProviders = app.providers.filter((provider) => provider.type === "music");
  const playerProviders = app.providers.filter((provider) => provider.type === "player");
  const roomCount = Object.keys(app.players).length;

  const openCopy = () => {
    setExported(exportPrefs());
    setMove("copy");
  };

  const copySettings = async () => {
    const copied = await copyText(exported);
    app.notify(copied ? "Settings copied" : "Select the text and copy it by hand");
  };

  const applySettings = () => {
    const restored = importPrefs(draft);
    if (!restored) {
      app.notify("That does not look like copied settings");
      return;
    }
    setMove(null);
    app.notify(`Restored ${restored} settings`);
    // Theme, order and pins are read when the app renders, so reload to show them at once.
    window.setTimeout(() => window.location.reload(), 800);
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
              Order, theme, pins and history
              <span className="panel__sublabel">
                Saved on this device for this server. Copy them here, then paste them at another
                address or in the installed app to carry the layout across.
              </span>
            </span>
          </div>
        </div>
        <div className="button-row">
          <button className="btn btn--ghost" onClick={openCopy}>
            Copy settings
          </button>
          <button className="btn btn--ghost" onClick={() => { setDraft(""); setMove("paste"); }}>
            Paste settings
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
          {app.backendKind === "mas" && app.permissions.libraryWrite ? (
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
          {app.permissions.username ? (
            <div className="panel__row">
              <span className="panel__label">Signed in as</span>
              <span className="panel__value panel__value--text">
                {app.permissions.username}
                {app.permissions.role ? ` · ${app.permissions.role}` : ""}
              </span>
            </div>
          ) : null}
          <div className="panel__row">
            <span className="panel__label">Settings for</span>
            <span className="panel__value panel__value--text">
              {/* Settings are stored per server and per account, so name whichever one is loaded. */}
              {app.backendKind === "demo"
                ? "This device's demo system"
                : app.baseUrl.replace(/^https?:\/\//, "") || "No server"}
            </span>
          </div>
        </div>
        {/* This app's own address, so the page can be opened in a tab or shared without
            remembering how it was reached (the ?server= hint and any #hash are dropped). */}
        <a
          className="link-row"
          href={`${window.location.origin}${window.location.pathname}`}
          target="_blank"
          rel="noreferrer"
        >
          <span>Open SoMaS in a new tab</span>
          <Icon name="external" size={18} />
        </a>
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

      <Sheet
        open={move !== null}
        onClose={() => setMove(null)}
        title={move === "copy" ? "Copy settings" : "Paste settings"}
        subtitle={
          move === "copy"
            ? "For the server you are connected to"
            : "From another address or the installed app"
        }
      >
        <div className="settings-move">
          <textarea
            className="settings-move__text"
            value={move === "copy" ? exported : draft}
            readOnly={move === "copy"}
            spellCheck={false}
            placeholder={move === "paste" ? "Paste the settings you copied" : undefined}
            onChange={(event) => {
              if (move === "paste") setDraft(event.target.value);
            }}
          />
          <p className="sheet__hint settings-move__hint">
            {move === "copy"
              ? "Copy this text, open SoMaS at the other address, then use Paste settings there."
              : "These settings replace the ones saved for the server you are connected to."}
          </p>
          <div className="button-row">
            {move === "copy" ? (
              <button className="btn" onClick={() => void copySettings()}>
                Copy to clipboard
              </button>
            ) : (
              <button className="btn" onClick={applySettings} disabled={!draft.trim()}>
                Apply
              </button>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
