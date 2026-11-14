import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { QrCode } from "../components/QrCode";
import { Section } from "../components/Media";
import { Sheet } from "../components/Sheet";
import { TopBar } from "../components/TopBar";
import { useNav } from "../nav";
import { STORAGE, useApp } from "../store";
import { copyText } from "../lib/clipboard";
import { settingsWereMigrated } from "../lib/migrationNotice";
import { exportAllPrefs, importPrefs, readPref, writePref } from "../lib/prefs";
import { makeGuestKey, replaceGuestKey } from "../lib/guestProxy";
import {
  EVERYTHING_ALLOWED,
  GUEST_OPTIONAL,
  isAllowed,
  loadGuestLimits,
  sendGuestLimits,
  type GuestFeature,
  type GuestLimits,
} from "../lib/guestLimits";
import { syncAddress, syncStampLabel } from "../lib/settingsSync";
import { buildGuestLink, buildSettingsLink, lastGuestHere } from "../lib/shareLinks";
import { saveVolumeStep, useVolumeStep } from "../lib/volumeStep";
import { THEME_FAMILIES, themesIn } from "../lib/themes";
import { useTheme } from "../theme";



export function SettingsScreen() {
  const app = useApp();
  const nav = useNav();
  const theme = useTheme();
  const volumeStep = useVolumeStep();
  const [syncing, setSyncing] = useState(false);
  // The toast for this is one-time; the panel keeps saying so, for anyone who missed it.
  const [migrated] = useState(() => settingsWereMigrated());
  // Moving the layout to another phone: one code, with the text kept behind a link for the rare
  // case a camera cannot be used. Neither path depends on the clipboard, which a phone can block.
  const [move, setMove] = useState<"share" | "paste" | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [showText, setShowText] = useState(false);
  const [exported, setExported] = useState("");
  const [draft, setDraft] = useState("");
  // Guest code: the proxy's address and key are typed once here, then carried by the code itself.
  const [guestServer, setGuestServer] = useState(() => readPref("guestServer") ?? "");
  const [guestKey, setGuestKey] = useState(() => readPref("guestKey") ?? "");
  const [guestCode, setGuestCode] = useState<string | null>(null);
  const [replacingKey, setReplacingKey] = useState(false);
  const [limits, setLimits] = useState<GuestLimits | null>(null);
  const [changingLimit, setChangingLimit] = useState<string | null>(null);
  const [keyChangedAt, setKeyChangedAt] = useState(() => readPref("guestKeyChangedAt"));
  const [syncOn, setSyncOn] = useState(() => readPref("settingsSyncOff") !== "1");
  const lastGuest = useRef(lastGuestHere());

  // The proxy decides what is switched off, so ask it rather than trusting this browser's copy.
  useEffect(() => {
    if (!guestServer.trim()) return;
    let cancelled = false;
    void loadGuestLimits(guestServer).then((next) => {
      if (!cancelled && next) setLimits(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const musicProviders = app.providers.filter((provider) => provider.type === "music");
  const playerProviders = app.providers.filter((provider) => provider.type === "player");
  const roomCount = Object.keys(app.players).length;

  const openShare = async () => {
    const bundle = exportAllPrefs();
    setExported(bundle);
    setShareLink("");
    setShowText(false);
    setMove("share");
    setShareLink(await buildSettingsLink(bundle));
  };

  // Typing in a guest field saves it straight away: there is no Apply button to forget.
  const setGuestAddress = (value: string) => {
    setGuestServer(value);
    writePref("guestServer", value);
  };

  const setGuestSecret = (value: string) => {
    setGuestKey(value);
    writePref("guestKey", value);
  };

  const copySettings = async () => {
    const copied = await copyText(exported);
    app.notify(copied ? "Settings copied" : "Select the text and copy it by hand");
  };

  /** Asks the proxy for a new key and shows the code that goes with it. */
  const replaceKey = async () => {
    const token = localStorage.getItem(STORAGE.token) ?? "";
    if (!token) {
      app.notify("Sign in again to change the guest key");
      return;
    }
    setReplacingKey(true);
    const next = makeGuestKey();
    const result = await replaceGuestKey(guestServer, token, next);
    setReplacingKey(false);
    if (!result.ok) {
      app.notify(result.error || "Could not replace the guest key");
      return;
    }
    setGuestSecret(next);
    setGuestCode(buildGuestLink(guestServer, next));
    const stamp = new Date().toISOString();
    setKeyChangedAt(stamp);
    writePref("guestKeyChangedAt", stamp);
    app.notify(
      result.persisted
        ? "New guest key: old codes and their sessions no longer work"
        : "New guest key until the proxy restarts — it has no writable key file",
    );
  };

  const toggleSync = () => {
    const next = !syncOn;
    setSyncOn(next);
    writePref("settingsSyncOff", next ? "0" : "1");
    app.notify(
      next
        ? `Settings will follow your account on ${syncAddress()}`
        : "This device keeps its own settings",
    );
  };

  const toggleLimit = async (feature: GuestFeature) => {
    const token = localStorage.getItem(STORAGE.token) ?? "";
    if (!token) {
      app.notify("Sign in again to change what guests may do");
      return;
    }
    const current = limits ?? EVERYTHING_ALLOWED;
    const off = current.off.includes(feature.id)
      ? current.off.filter((id) => id !== feature.id)
      : [...current.off, feature.id];
    setLimits({ off });
    setChangingLimit(feature.id);
    const result = await sendGuestLimits(guestServer, token, off);
    setChangingLimit(null);
    if (!result.ok) {
      setLimits(current);
      app.notify(result.error || "Could not change that");
      return;
    }
    app.notify(
      result.persisted
        ? `${feature.label} ${off.includes(feature.id) ? "turned off" : "turned on"} for guests`
        : "Changed until the proxy restarts — it has no writable key file",
    );
  };

  const copySettingsLink = async () => {
    const copied = await copyText(shareLink);
    app.notify(copied ? "Link copied — open it on the other phone" : "Select the link and copy it by hand");
  };

  const shareSettings = async () => {
    if (!shareLink) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "SoMaS settings", url: shareLink });
        return;
      } catch {
        // Cancelled or unsupported after all: fall through to copying.
      }
    }
    const copied = await copyText(shareLink);
    app.notify(copied ? "Link copied — open it on the other phone" : "Select the link and copy it by hand");
  };

  const copyGuestLink = async () => {
    if (!guestCode) return;
    const copied = await copyText(guestCode);
    app.notify(copied ? "Guest link copied" : "Select the address and copy it by hand");
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
                Saved on this device per server and per account. Show the code, scan it with the
                new phone, and every server's layout comes across in one go.
              </span>
            </span>
          </div>
          <div className="panel__row">
            <span className="panel__label panel__label--stack">
              Follow my account
              <span className="panel__sublabel">
                Keeps a copy on {syncAddress()} so a phone that signs in opens with this layout, and
                nothing has to be sent to it. Last exchange: {syncStampLabel() ?? "not yet"}.
              </span>
            </span>
            <button
              className={`switch ${syncOn ? "is-on" : ""}`}
              role="switch"
              aria-checked={syncOn}
              aria-label="Follow my account"
              onClick={toggleSync}
            >
              <span className="switch__knob" />
            </button>
          </div>
          {migrated ? (
            <div className="panel__row">
              <span className="panel__label panel__label--stack">
                Your saved settings moved across to SoMaS
                <span className="panel__sublabel">
                  Theme, order and pins were carried over from the app's earlier name, so nothing you
                  had chosen was lost. This note stays here after the one-time message goes.
                </span>
              </span>
            </div>
          ) : null}
        </div>
        <div className="button-row">
          <button className="btn btn--ghost" onClick={() => void openShare()}>
            Move settings to another phone
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => {
              setDraft("");
              setMove("paste");
            }}
          >
            Paste settings
          </button>
        </div>
      </Section>

      <Section title="Guests">
        <div className="panel">
          <div className="panel__row">
            <span className="panel__label panel__label--stack">
              A code instead of a password
              <span className="panel__sublabel">
                Fill in the proxy's address and its guest key once. The code carries both, so a
                visitor scans it and lands on the room controls with nothing to type.
              </span>
            </span>
          </div>
        </div>
        <label className="field settings-field">
          <span>Guest proxy address</span>
          <input
            value={guestServer}
            onChange={(event) => setGuestAddress(event.target.value)}
            placeholder="192.168.1.20:8090"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
          />
          <span className="field__hint">
            The address the proxy runs on, as a phone on this network would reach it.
          </span>
        </label>
        <label className="field settings-field">
          <span>Guest key</span>
          <input
            value={guestKey}
            onChange={(event) => setGuestSecret(event.target.value)}
            placeholder="The GUEST_KEY the proxy runs with"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
                      <span className="field__hint">
              Not a Music Assistant password: only the proxy knows it. Replace key asks the proxy
              for a fresh one, which retires every code already shared and cuts the sessions it
              opened.
            </span>
        </label>
        {lastGuest.current && !guestServer.trim() ? (
          <p className="panel__hint">
            This phone was opened with a guest code from {lastGuest.current.server}.{" "}
            <button
              className="chip"
              onClick={() => {
                setGuestAddress(lastGuest.current?.server ?? "");
                setGuestSecret(lastGuest.current?.key ?? "");
              }}
            >
              Use it
            </button>
          </p>
        ) : null}
        <div className="button-row">
          <button
            className="btn btn--ghost"
            disabled={!guestServer.trim() || !guestKey.trim()}
            onClick={() => setGuestCode(buildGuestLink(guestServer, guestKey))}
          >
            <Icon name="external" size={18} />
            Show guest code
          </button>
          <button
            className="btn btn--ghost btn--danger"
            disabled={!guestServer.trim() || replacingKey}
            onClick={() => void replaceKey()}
          >
            <Icon name="refresh" size={18} />
            {replacingKey ? "Replacing…" : "Replace key"}
          </button>
        </div>

        <p className="theme-group__label">What guests may change</p>
        <div className="panel">
          {GUEST_OPTIONAL.map((feature) => {
            const on = isAllowed(limits, feature.id);
            return (
              <div className="panel__row" key={feature.id}>
                <span className="panel__label">{feature.label}</span>
                <button
                  className={`switch ${on ? "is-on" : ""}`}
                  role="switch"
                  aria-checked={on}
                  aria-label={feature.label}
                  disabled={changingLimit === feature.id}
                  onClick={() => void toggleLimit(feature)}
                >
                  <span className="switch__knob" />
                </button>
              </div>
            );
          })}
        </div>
        <p className="panel__hint">
          These are enforced by the proxy itself, so switching one off takes effect on every phone
          holding a code, straight away.
        </p>
        {keyChangedAt ? (
          <p className="panel__hint">
            Last key replaced {new Date(keyChangedAt).toLocaleString()}. Codes shown before then no
            longer work.
          </p>
        ) : null}
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
        <a
          className="link-row"
          href="https://github.com/triwayben/SoMaS"
          target="_blank"
          rel="noreferrer"
        >
          <span>SoMaS on GitHub</span>
          <Icon name="external" size={18} />
        </a>
      </Section>

      <p className="footnote">
        Playback, rooms, sources and library data all come live from Music Assistant over its
        websocket API.
      </p>

      <Sheet
        open={move !== null}
        onClose={() => setMove(null)}
        title={move === "paste" ? "Paste settings" : "Move settings to another phone"}
        subtitle={
          move === "paste"
            ? "From another address or the installed app"
            : "Every server saved on this device"
        }
      >
        <div className="settings-move">
          {move === "paste" ? (
            <>
              <textarea
                className="settings-move__text"
                value={draft}
                spellCheck={false}
                placeholder="Paste the settings you copied"
                onChange={(event) => setDraft(event.target.value)}
              />
              <p className="sheet__hint settings-move__hint">
                Settings for every server in this text replace the ones saved here; a plain
                single-server copy replaces only the server you are connected to.
              </p>
              <div className="button-row">
                <button className="btn" onClick={applySettings} disabled={!draft.trim()}>
                  Apply
                </button>
              </div>
            </>
          ) : showText ? (
            <>
              <textarea
                className="settings-move__text"
                value={exported}
                readOnly
                spellCheck={false}
              />
              <p className="sheet__hint settings-move__hint">
                Copy this text into Paste settings on the other device instead of scanning.
              </p>
              <div className="button-row">
                <button className="btn" onClick={() => void copySettings()}>
                  Copy to clipboard
                </button>
                <button className="btn btn--ghost" onClick={() => setShowText(false)}>
                  Show the code instead
                </button>
              </div>
            </>
          ) : shareLink ? (
            <>
              <p className="sheet__hint settings-move__hint">
                Send this link to the other phone — a message to yourself, AirDrop, or the share
                sheet — and open it there. SoMaS offers to carry every server's layout over.
              </p>
              <code className="settings-move__link">{shareLink}</code>
              <div className="button-row">
                <button className="btn btn--primary" onClick={() => void shareSettings()}>
                  Share link
                </button>
                <button className="btn" onClick={() => void copySettingsLink()}>
                  Copy link
                </button>
              </div>
            </>
          ) : (
            <p className="sheet__hint settings-move__hint">Making the link…</p>
          )}
          {move !== "paste" && !showText && shareLink ? (
            <div className="button-row">
              <button className="btn btn--ghost" onClick={() => setShowText(true)}>
                Show the text instead
              </button>
            </div>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={guestCode !== null}
        onClose={() => setGuestCode(null)}
        title="Guest code"
        subtitle="Scan it, and you are controlling the music"
      >
        {guestCode ? (
          <div className="settings-move">
            <QrCode
              text={guestCode}
              caption="Point the visitor's camera at this. SoMaS opens on their phone already signed in as a guest."
            />
            <p className="sheet__hint settings-move__hint">
              Anyone who scans this can control your rooms until you change GUEST_KEY and restart
              the proxy. It is a share, not a secret.
            </p>
            {/* Shown here as well as in the section above, so what the code hands over is visible
                at the moment it is handed over. These are the same switches, not a copy. */}
            <p className="theme-group__label">What this code allows</p>
            <div className="panel">
              {GUEST_OPTIONAL.map((feature) => {
                const on = isAllowed(limits, feature.id);
                return (
                  <div className="panel__row" key={feature.id}>
                    <span className="panel__label">{feature.label}</span>
                    <button
                      className={`switch ${on ? "is-on" : ""}`}
                      role="switch"
                      aria-checked={on}
                      aria-label={`Allow guests to ${feature.label.toLowerCase()}`}
                      disabled={changingLimit === feature.id}
                      onClick={() => void toggleLimit(feature)}
                    >
                      <span className="switch__knob" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="button-row">
              <button className="btn" onClick={() => void copyGuestLink()}>
                Copy link
              </button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
