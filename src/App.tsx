import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { Icon } from "./components/Icon";
import { GroupSheet } from "./components/GroupSheet";
import { PlayerBubble } from "./components/PlayerBubble";
import { Sheet } from "./components/Sheet";
import { NavContext, type NavValue, type Route, type TabName } from "./nav";
import { BrowseScreen } from "./screens/Browse";
import { ConnectScreen } from "./screens/Connect";
import { HomeScreen } from "./screens/Home";
import { MediaDetailScreen } from "./screens/MediaDetail";
import { NowPlaying } from "./screens/NowPlaying";
import { PlayerSettingsScreen } from "./screens/PlayerSettings";
import { PlayerSettingsContent } from "./screens/PlayerSettingsContent";
import { ProfileScreen } from "./screens/Profile";
import { QueueScreen } from "./screens/Queue";
import { SearchScreen } from "./screens/Search";
import { SettingsScreen } from "./screens/Settings";
import { SystemScreen } from "./screens/System";
import { syncOnConnect, watchSettings } from "./lib/settingsSync";
import { AppProvider, STORAGE, useApp } from "./store";
import { takeMigrationNotice } from "./lib/migrationNotice";
import { importPrefs } from "./lib/prefs";
import { clearLaunchHash, readLaunch, type ImportLaunch } from "./lib/shareLinks";
import { useViewportHeight } from "./lib/viewportHeight";
import { ThemeProvider } from "./theme";

function Shell() {
  const app = useApp();
  const [tab, setTab] = useState<TabName>("home");
  const [stack, setStack] = useState<Route[]>([]);
  const [overlay, setOverlay] = useState<"none" | "now" | "queue">("none");
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [groupFor, setGroupFor] = useState<string | null>(null);
  // A scanned settings code waits here until it is accepted, so carrying a layout over never
  // replaces this phone's own without being asked.
  const [incoming, setIncoming] = useState<ImportLaunch | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useViewportHeight();

  const guest = app.permissions.role === "guest";

  const route: Route = stack.length ? stack[stack.length - 1] : ({ name: tab } as Route);
  const isRoot = stack.length === 0;
  // The system screen lists every room with its own transport and volume, so the
  // floating player would only duplicate it.
  const showBubble = !(isRoot && route.name === "system");
  const scrollPad = !isRoot ? "has-mini" : route.name === "system" ? "has-nav" : "has-tabs";

  const nav = useMemo<NavValue>(
    () => ({
      tab,
      route,
      canGoBack: stack.length > 0,
      goTab: (next) => {
        setStack([]);
        setTab(next);
      },
      push: (next) => setStack((prev) => [...prev, next]),
      back: () => setStack((prev) => prev.slice(0, -1)),
      openNowPlaying: () => setOverlay("now"),
      openQueue: () => setOverlay("queue"),
      closeOverlay: () => setOverlay("none"),
    }),
    [tab, route, stack.length],
  );

  const routeKey =
    route.name === "media"
      ? `media-${route.item.uri}`
      : route.name === "player"
        ? `player-${route.playerId}`
        : route.name;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [routeKey]);

  // Once an upgrade has moved saved settings, say so the first time the app is usable, so a kept
  // login or a restored layout reads as intended rather than as something gone wrong.
  useEffect(() => {
    if (app.phase !== "ready") return;
    const message = takeMigrationNotice();
    if (message) app.notify(message);
  }, [app.phase, app.notify]);

  // A settings code from another phone asks first, then replaces what it carries.
  useEffect(() => {
    let cancelled = false;
    void readLaunch().then((launch) => {
      if (cancelled || launch?.kind !== "import") return;
      clearLaunchHash();
      setIncoming(launch);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The account's own copy of the layout: adopted when it is newer than this device's, and kept
  // up to date afterwards. A phone that has never been here therefore needs no link at all.
  useEffect(() => {
    // A guest's layout is theirs, and the guest key is not even a Music Assistant login.
    if (app.phase !== "ready" || app.backendKind !== "mas" || guest) return;
    const token = localStorage.getItem(STORAGE.token) ?? "";
    if (!token) return;
    let cancelled = false;
    void syncOnConnect(token).then((result) => {
      if (cancelled || result !== "adopted") return;
      app.notify("Settings came with your account");
      // Theme, order and pins are read as the app renders, so show them straight away.
      window.setTimeout(() => window.location.reload(), 900);
    });
    return () => {
      cancelled = true;
    };
  }, [app.phase, app.backendKind, app.notify, guest]);

  useEffect(() => {
    if (app.phase !== "ready" || app.backendKind !== "mas" || guest) return;
    const token = localStorage.getItem(STORAGE.token) ?? "";
    if (!token) return;
    return watchSettings(token);
  }, [app.phase, app.backendKind, guest]);

  const carrySettings = () => {
    if (!incoming) return;
    const restored = importPrefs(incoming.bundle);
    setIncoming(null);
    if (!restored) {
      app.notify("That code did not carry any settings");
      return;
    }
    app.notify(`Carried over ${restored} settings`);
    // Theme, order and pins are read as the app renders, so reload to show them at once.
    window.setTimeout(() => window.location.reload(), 800);
  };

  // Rendered either way: a settings code can land on a phone that has never connected, and asking
  // about it beats a Connect screen with no explanation.
  const incomingSheet = (
    <Sheet
      open={incoming !== null}
      onClose={() => setIncoming(null)}
      title="Carry settings over?"
      subtitle="From another device"
    >
      <div className="settings-move">
        <p className="sheet__hint settings-move__hint">
          {incoming
            ? `${incoming.servers} ${incoming.servers === 1 ? "server" : "servers"} and ${incoming.preferences} ${incoming.preferences === 1 ? "setting" : "settings"} will replace what is saved on this phone for those servers.`
            : ""}
        </p>
        <div className="button-row">
          <button className="btn btn--primary" onClick={carrySettings}>
            Carry them over
          </button>
          <button className="btn" onClick={() => setIncoming(null)}>
            Not now
          </button>
        </div>
      </div>
    </Sheet>
  );

  if (app.phase !== "ready") {
    return (
      <>
        <ConnectScreen />
        {incomingSheet}
      </>
    );
  }

  const content = (() => {
    switch (route.name) {
      case "home":
        return <HomeScreen />;
      case "system":
        return <SystemScreen />;
      case "search":
        return <SearchScreen />;
      case "browse":
        return <BrowseScreen route={route} />;
      case "media":
        return <MediaDetailScreen item={route.item} />;
      case "player":
        return <PlayerSettingsScreen playerId={route.playerId} />;
      case "profile":
        return <ProfileScreen />;
      case "settings":
        // A guest has nothing useful to arrange here, and the screens behind it are the owner's.
        return guest ? <HomeScreen /> : <SettingsScreen />;
      default:
        return <HomeScreen />;
    }
  })();

  return (
    <NavContext.Provider value={nav}>
      <div className={`app ${scrollPad}`}>
        {app.connState === "reconnecting" ? (
          <div className="banner">
            <span className="banner__dot" />
            Reconnecting to Music Assistant…
          </div>
        ) : null}

        <div
          className={`app__scroll ${scrollPad}`}
          ref={scrollRef}
          key={route.name === "media" ? `media-${route.item.uri}` : undefined}
        >
          {content}
        </div>

        {overlay === "none" ? (
          <div className="dock">
            {showBubble ? (
              <PlayerBubble
                onOpen={() => setOverlay("now")}
                onGroup={() => setGroupFor(app.selectedId)}
                onSettings={(playerId) => setSettingsFor(playerId)}
              />
            ) : null}
            {isRoot ? (
              <BottomNav
                tab={tab}
                onChange={(next) => {
                  setTab(next);
                  setStack([]);
                }}
              />
            ) : null}
          </div>
        ) : null}

        {overlay === "now" ? <NowPlaying onClose={() => setOverlay("none")} /> : null}
        {overlay === "queue" ? <QueueScreen onBack={() => setOverlay("now")} /> : null}

        <Sheet
          open={Boolean(settingsFor)}
          onClose={() => setSettingsFor(null)}
          title={
            settingsFor
              ? `${app.players[settingsFor]?.name ?? "Room"} settings`
              : "Room settings"
          }
          subtitle={settingsFor ? app.players[settingsFor]?.device_info?.model : undefined}
        >
          {settingsFor ? (
            <PlayerSettingsContent playerId={settingsFor} showHero={false} />
          ) : null}
        </Sheet>

        {groupFor ? (
          <GroupSheet playerId={groupFor} onClose={() => setGroupFor(null)} />
        ) : null}

        {incomingSheet}

        {app.toast ? (
          <div className="toast" role="status">
            <span className="toast__text">{app.toast}</span>
            <button
              className="toast__close"
              type="button"
              aria-label="Dismiss"
              onClick={app.dismissToast}
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        ) : null}
      </div>
    </NavContext.Provider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ThemeProvider>
  );
}
