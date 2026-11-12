import { useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  ItemMapping,
  MediaItem,
  MusicProvider,
  RecommendationsFolder,
} from "../api/types";
import { Icon, type IconName } from "../components/Icon";
import { EmptyState, MediaCard, MediaRow, Rail, Section, Spinner } from "../components/Media";
import { ServiceLogo } from "../components/ServiceLogo";
import { Sheet } from "../components/Sheet";
import { TopBar } from "../components/TopBar";
import { topLevelRooms } from "../lib/players";
import { usePlayActions } from "../lib/usePlayActions";
import { useNav } from "../nav";
import { useApp } from "../store";

/**
 * Favorites are listed per media type with `favorite: true`; older builds answered a
 * dedicated favorites command, so fall back to that when the typed listings are empty.
 */
async function loadFavorites(send: SendFn): Promise<MediaItem[]> {
  const types = ["albums", "playlists", "artists", "radios", "tracks"];
  const lists = await Promise.all(
    types.map((plural) =>
      send<MediaItem[]>(`music/${plural}/library_items`, { favorite: true, limit: 6 }).catch(
        () => [] as MediaItem[],
      ),
    ),
  );
  const merged = lists.flat().filter(Boolean).slice(0, 12);
  if (merged.length) return merged;
  return send<MediaItem[]>("music/favorites/library_items", { limit: 12 }).catch(
    () => [] as MediaItem[],
  );
}

type SendFn = <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;

const SERVICE_ORDER_KEY = "sonos4ma.services";

function readServiceOrder(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SERVICE_ORDER_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function saveServiceOrder(ids: string[]) {
  localStorage.setItem(SERVICE_ORDER_KEY, JSON.stringify(ids));
}

const SERVICE_ICON_ONLY_KEY = "sonos4ma.services.iconOnly";

function readIconOnly(): boolean {
  return localStorage.getItem(SERVICE_ICON_ONLY_KEY) === "1";
}

function saveIconOnly(value: boolean) {
  localStorage.setItem(SERVICE_ICON_ONLY_KEY, value ? "1" : "0");
}

const LIBRARY_LINKS: Array<{ mediaType: string; label: string; icon: IconName }> = [
  { mediaType: "album", label: "Albums", icon: "album" },
  { mediaType: "artist", label: "Artists", icon: "artist" },
  { mediaType: "playlist", label: "Playlists", icon: "playlist" },
  { mediaType: "track", label: "Songs", icon: "music" },
  { mediaType: "radio", label: "Radio", icon: "radio" },
  { mediaType: "genre", label: "Genres", icon: "sparkles" },
  { mediaType: "podcast", label: "Podcasts", icon: "queue" },
  { mediaType: "audiobook", label: "Audiobooks", icon: "library" },
];

export function HomeScreen() {
  const app = useApp();
  const nav = useNav();
  const play = usePlayActions();
  const [{ recent, favorites, recommendations }, setData] = useState<{
    recent: ItemMapping[];
    favorites: MediaItem[];
    recommendations: RecommendationsFolder[];
  }>({ recent: [], favorites: [], recommendations: [] });
  const [busy, setBusy] = useState(true);
  const [serviceOrder, setServiceOrder] = useState<string[]>(() => readServiceOrder());
  const [serviceWidth, setServiceWidth] = useState<number | null>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [iconOnly, setIconOnly] = useState(() => readIconOnly());
  const [draggingService, setDraggingService] = useState<string | null>(null);
  const serviceRowEls = useRef<Map<string, HTMLElement>>(new Map());

  const { send, providers, backendKind } = app;
  const rooms = topLevelRooms(Object.values(app.players));
  const selectedName = app.selectedId ? app.players[app.selectedId]?.name : undefined;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [recentItems, favoriteItems, recommendationRows] = await Promise.all([
        send<ItemMapping[]>("music/recently_played_items", {
          limit: 12,
          media_types: ["track", "album", "playlist", "radio", "artist"],
        }).catch(() => [] as ItemMapping[]),
        loadFavorites(send),
        send<RecommendationsFolder[]>("music/recommendations").catch(
          () => [] as RecommendationsFolder[],
        ),
      ]);
      if (cancelled) return;
      setData({
        recent: recentItems ?? [],
        favorites: favoriteItems,
        recommendations: (recommendationRows ?? []).filter((row) => (row.items?.length ?? 0) > 0),
      });
      setBusy(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [send, providers.length]);

  const musicProviders: MusicProvider[] = providers.filter(
    (provider) => provider.type === "music" && provider.available !== false,
  );

  // Saved order first, then any services the user has not arranged yet by name.
  const serviceRank = new Map(serviceOrder.map((id, index) => [id, index]));
  const orderedServices = [...musicProviders].sort((a, b) => {
    const rankA = serviceRank.get(a.instance_id) ?? Number.MAX_SAFE_INTEGER;
    const rankB = serviceRank.get(b.instance_id) ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB || a.name.localeCompare(b.name);
  });

  // One width for every card: the widest service name plus the logo, chevron and padding.
  const serviceNamesKey = orderedServices.map((provider) => provider.name).join("|");
  useEffect(() => {
    if (!orderedServices.length) return;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    const sample = document.querySelector<HTMLElement>(".service__name");
    const style = sample ? getComputedStyle(sample) : null;
    context.font = `${style?.fontWeight ?? "600"} ${style?.fontSize ?? "13px"} ${
      style?.fontFamily ?? "-apple-system, BlinkMacSystemFont, Segoe UI, Inter, Roboto, Arial, sans-serif"
    }`;
    const widest = Math.max(
      ...orderedServices.map((provider) => context.measureText(provider.name).width),
    );
    // Logo, both paddings and the gap between them; the chevron is gone.
    setServiceWidth(Math.ceil(widest) + 68);
  }, [serviceNamesKey]);

  const moveService = (id: string, overId: string) => {
    const current = orderedServices.map((provider) => provider.instance_id);
    const from = current.indexOf(id);
    const to = current.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return;
    current.splice(from, 1);
    current.splice(to, 0, id);
    saveServiceOrder(current);
    setServiceOrder(current);
  };

  const startServiceDrag = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic pointers have no capture */
    }
    setDraggingService(id);
  };

  const moveServiceDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingService) return;
    let over: string | null = null;
    for (const [id, element] of serviceRowEls.current) {
      const rect = element.getBoundingClientRect();
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
        over = id;
        break;
      }
    }
    if (!over || over === draggingService) return;
    moveService(draggingService, over);
  };

  const endServiceDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* ignore */
    }
    setDraggingService(null);
  };

  return (
    <>
      <TopBar
        title={selectedName ?? "My System"}
        subtitle={`${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`}
        onTitle={() => nav.goTab("system")}
        right={
          <>
            {backendKind === "demo" ? <span className="pill">Demo</span> : null}
            <button className="icon-btn" onClick={() => nav.push({ name: "settings" })} aria-label="Settings">
              <Icon name="sliders" size={22} />
            </button>
          </>
        }
      />

      {busy ? (
        <Spinner label="Loading your music" />
      ) : rooms.length === 0 ? (
        <EmptyState
          icon="speaker"
          title="No rooms found"
          body="Music Assistant did not report any players. Add a player provider in Music Assistant, then reload."
        />
      ) : null}

      {orderedServices.length ? (
        <Section
          title="Music services"
          action={
            orderedServices.length > 1 ? (
              <button
                className="section__action section__action--icon"
                onClick={() => setArrangeOpen(true)}
                aria-label="Arrange music services"
                title="Arrange music services"
              >
                <Icon name="drag" size={20} strokeWidth={2.2} />
              </button>
            ) : undefined
          }
        >
          <div className={`service-rail ${iconOnly ? "service-rail--icons" : ""}`}>
            <div
              className="service-rail__track"
              style={
                serviceWidth
                  ? ({ "--service-width": `${serviceWidth}px` } as CSSProperties)
                  : undefined
              }
            >
              {orderedServices.map((provider) => (
                <button
                  key={provider.instance_id}
                  className="service"
                  aria-label={provider.name}
                  title={iconOnly ? provider.name : undefined}
                  onClick={() =>
                    nav.push({
                      name: "browse",
                      title: provider.name,
                      query: { kind: "path", path: provider.instance_id },
                    })
                  }
                >
                  <ServiceLogo provider={provider} size={iconOnly ? 40 : 34} />
                  <span className="service__text">
                    <span className="service__name">{provider.name}</span>
                    <span className="service__sub">
                      {provider.available === false ? "Unavailable" : "Connected"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Section>
      ) : null}

      {recent.length ? (
        <Section title="Recently played">
          <Rail>
            {recent.map((item, index) => (
              <MediaCard
                key={`${item.uri ?? item.name}-${index}`}
                item={item}
                baseUrl={app.baseUrl}
                surface
                onPress={() => play.play(item)}
              />
            ))}
          </Rail>
        </Section>
      ) : null}

      {favorites.length ? (
        <Section title="Favorites">
          <Rail>
            {favorites.map((item, index) => (
              <MediaCard
                key={`${item.uri ?? item.name}-${index}`}
                item={item}
                baseUrl={app.baseUrl}
                surface
                onPress={() => play.play(item)}
              />
            ))}
          </Rail>
        </Section>
      ) : null}

      {recommendations.map((folder) => (
        <Section key={folder.item_id} title={folder.name}>
          <Rail>
            {(folder.items ?? []).map((item, index) => (
              <MediaCard
                key={`${item.uri ?? item.name}-${index}`}
                item={item}
                baseUrl={app.baseUrl}
                surface
                onPress={() => play.play(item)}
              />
            ))}
          </Rail>
        </Section>
      ))}

      <Section title="Your library">
        <div className="rows">
          {LIBRARY_LINKS.map((link) => (
            <MediaRow
              key={link.mediaType}
              title={link.label}
              icon={link.icon}
              trail={<Icon name="chevronRight" size={18} />}
              onClick={() =>
                nav.push({
                  name: "browse",
                  title: link.label,
                  query: { kind: "library", mediaType: link.mediaType },
                })
              }
            />
          ))}
        </div>
      </Section>

      {!recent.length && !favorites.length && !busy ? (
        <Section title="Get started">
          <EmptyState
            icon="music"
            title="Nothing played yet"
            body="Your favorites and recently played items will show up here. Use Search or a music service below to start."
          />
        </Section>
      ) : null}

      <Sheet
        open={arrangeOpen}
        onClose={() => setArrangeOpen(false)}
        title="Music services"
        subtitle="Drag to set the order they appear in"
      >
        <div className="panel">
          <div className="panel__row">
            <span className="panel__label panel__label--stack">
              Show service names
              <span className="panel__sublabel">Off shows just the logos</span>
            </span>
            <button
              className={`switch ${iconOnly ? "" : "is-on"}`}
              role="switch"
              aria-checked={!iconOnly}
              aria-label="Show service names"
              onClick={() =>
                setIconOnly((current) => {
                  const next = !current;
                  saveIconOnly(next);
                  return next;
                })
              }
            >
              <span className="switch__knob" />
            </button>
          </div>
        </div>

        <div className="rows">
          {orderedServices.map((provider) => (
            <div
              key={provider.instance_id}
              ref={(element) => {
                if (element) serviceRowEls.current.set(provider.instance_id, element);
                else serviceRowEls.current.delete(provider.instance_id);
              }}
              className={`row pin-row ${
                draggingService === provider.instance_id ? "is-dragging" : ""
              }`}
            >
              <button
                className="pin-grip"
                aria-label={`Reorder ${provider.name}`}
                onPointerDown={(event) => startServiceDrag(event, provider.instance_id)}
                onPointerMove={moveServiceDrag}
                onPointerUp={endServiceDrag}
                onPointerCancel={endServiceDrag}
              >
                <Icon name="drag" size={18} />
              </button>
              <div className="row__main">
                <span className="row__art">
                  <ServiceLogo provider={provider} size={52} />
                </span>
                <span className="row__body">
                  <span className="row__title">{provider.name}</span>
                  <span className="row__sub">
                    {provider.available === false ? "Unavailable" : "Connected"}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="sheet__hint">
          This order is saved on this device. New services are added at the end.
        </p>
      </Sheet>

      <div className="home__foot">
        {app.serverInfo?.server_version ? (
          <span>Music Assistant {String(app.serverInfo.server_version).split(" ")[0]}</span>
        ) : null}
        {app.selectedId ? (
          <span className="home__foot-sub">Playing on {app.players[app.selectedId]?.name}</span>
        ) : null}
      </div>

    </>
  );
}
