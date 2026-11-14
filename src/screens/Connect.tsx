import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { loginWithPassword, normalizeBaseUrl } from "../api/mas";
import { discoverServers } from "../lib/discoverServer";
import { accountHash } from "../lib/prefs";
import { loadSuggestedServer } from "../lib/serverSuggestion";
import { STORAGE, useApp } from "../store";

type Mode = "token" | "password";

export function ConnectScreen() {
  const app = useApp();
  const [server, setServer] = useState(
    () => localStorage.getItem(STORAGE.server)?.replace(/^https?:\/\//, "") ?? "",
  );
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<Mode>("token");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const serverTouched = useRef(false);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<string[]>([]);
  const [findNote, setFindNote] = useState<string | null>(null);

  // Suggest the address this build was pointed at, so nobody has to type it per device.
  useEffect(() => {
    let cancelled = false;
    void loadSuggestedServer().then((suggested) => {
      if (cancelled || !suggested || serverTouched.current) return;
      setServer((current) => (current.trim() ? current : suggested));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A guest code that failed leaves its address behind, so the field only needs the key retyped.
  useEffect(() => {
    if (!app.baseUrl || serverTouched.current) return;
    setServer((current) => (current.trim() ? current : app.baseUrl.replace(/^https?:\/\//, "")));
  }, [app.baseUrl]);

  const connecting = app.phase === "connecting" || busy;

  const findServer = async () => {
    setFinding(true);
    setFindNote(null);
    try {
      const answers = await discoverServers();
      setFound(answers);
      if (!answers.length) {
        setFindNote(
          window.location.protocol === "https:"
            ? "Nothing answered. A page served over HTTPS will not reach a plain-HTTP server, so type the address instead."
            : "No Music Assistant answered on this network. Check it is running, then type the address.",
        );
      }
    } finally {
      setFinding(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (!server.trim()) {
      setError("Enter your Music Assistant address");
      return;
    }
    setBusy(true);
    try {
      let accessToken = token.trim();
      let identity: string | undefined;
      if (mode === "password") {
        const baseUrl = normalizeBaseUrl(server);
        accessToken = await loginWithPassword(baseUrl, username.trim(), password);
        // The username is the stable half of a password login; the token it returns is per session.
        identity = accountHash(username.trim());
      }
      await app.connect({ baseUrl: server, token: accessToken, accountHash: identity });
    } catch (err) {
      setError((err as Error).message || "Could not connect");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="connect">
      <div className="connect__glow" aria-hidden="true" />
      <div className="connect__inner">
        <div className="connect__brand">
          <span className="connect__logo">SoMaS</span>
          <span className="connect__badge">for Music Assistant</span>
        </div>
        <h1 className="connect__headline">Your whole home, one tap away.</h1>
        <p className="connect__tagline">
          Control every room, source and queue from your Music Assistant server — with the layout
          you already know.
        </p>

        <form className="connect__form" onSubmit={submit}>
          <label className="field">
            <span>Music Assistant address</span>
            <input
              value={server}
              onChange={(event) => {
                serverTouched.current = true;
                setServer(event.target.value);
              }}
              placeholder="music-assistant.local:8095"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
            />
            <span className="field__hint">
              The host and port of your Music Assistant webserver. <strong>8095 is its default</strong>
              ; to check or change it, open Music Assistant → <code>Settings</code> →{" "}
              <code>Core</code> → <code>Webserver</code> and read <code>TCP Port</code>. Add{" "}
              <code>https://</code> if you turned on SSL/TLS in the same place.
            </span>
          </label>

          <div className="connect__find">
            {found.length ? (
              <div className="chips">
                {found.map((address) => (
                  <button
                    key={address}
                    type="button"
                    className="chip"
                    onClick={() => {
                      serverTouched.current = true;
                      setServer(address);
                    }}
                  >
                    {address}
                  </button>
                ))}
              </div>
            ) : null}
            {findNote ? <p className="connect__find-note">{findNote}</p> : null}
            <button
              className="connect__find-button"
              type="button"
              onClick={() => void findServer()}
              disabled={finding}
            >
              {finding
                ? "Looking around this network…"
                : found.length
                  ? "Look again"
                  : "Find my server"}
            </button>
          </div>

          {mode === "token" ? (
            <label className="field">
              <span>Access token</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Long-lived access token"
                type="password"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="field__hint">
                Music Assistant → Settings → Profile → Long-lived access tokens. It stays in this
                browser.
              </span>
            </label>
          ) : (
            <>
              <label className="field">
                <span>Username</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                />
              </label>
            </>
          )}

          {error || app.error ? (
            <div className="connect__error">
              <Icon name="offline" size={16} />
              <span>{error ?? app.error}</span>
            </div>
          ) : null}

          <button className="btn btn--primary btn--block" type="submit" disabled={connecting}>
            {connecting ? <span className="spinner spinner--inline" /> : null}
            {connecting ? "Connecting…" : "Connect"}
          </button>

          <button
            type="button"
            className="connect__switch"
            onClick={() => setMode(mode === "token" ? "password" : "token")}
          >
            {mode === "token" ? "Use username & password instead" : "Use an access token instead"}
          </button>
        </form>

        <div className="connect__divider">
          <span>or</span>
        </div>

        <button
          className="btn btn--ghost btn--block"
          onClick={() => void app.connectDemo()}
          disabled={connecting}
        >
          Explore the demo system
        </button>

        <p className="connect__foot">
          Every control maps to the Music Assistant API: rooms, groups, sources, inputs, EQ options,
          queues and search. Nothing is stored on a server of ours.
        </p>
      </div>
    </div>
  );
}
