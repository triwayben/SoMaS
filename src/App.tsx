import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav } from "./components/BottomNav";
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
import { AppProvider, useApp } from "./store";
import { useViewportHeight } from "./lib/viewportHeight";
import { ThemeProvider } from "./theme";

function Shell() {
  const app = useApp();
  const [tab, setTab] = useState<TabName>("home");
  const [stack, setStack] = useState<Route[]>([]);
  const [overlay, setOverlay] = useState<"none" | "now" | "queue">("none");
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [groupFor, setGroupFor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useViewportHeight();

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

  if (app.phase !== "ready") {
    return <ConnectScreen />;
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
        return <SettingsScreen />;
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

        {app.toast ? <div className="toast">{app.toast}</div> : null}
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
