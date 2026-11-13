import { useEffect, useRef, useState } from "react";
import type { ItemMapping, MediaItem, SearchResults } from "../api/types";
import { Artwork } from "../components/Artwork";
import { Icon } from "../components/Icon";
import { ItemActionsSheet } from "../components/ItemActions";
import { Chips, EmptyState, MediaRow, Section, Spinner } from "../components/Media";
import { TopBar } from "../components/TopBar";
import { itemImage, itemSeed, itemSubtitle } from "../lib/players";
import { usePlayActions } from "../lib/usePlayActions";
import { useNav } from "../nav";
import { useApp } from "../store";

const HISTORY_KEY = "somas.searches";

type Filter = "all" | "track" | "album" | "artist" | "playlist" | "radio" | "podcast";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "track", label: "Songs" },
  { value: "album", label: "Albums" },
  { value: "artist", label: "Artists" },
  { value: "playlist", label: "Playlists" },
  { value: "radio", label: "Stations" },
  { value: "podcast", label: "Podcasts" },
];

const SUGGESTIONS = ["Jazz", "Radio Paradise", "Playlists", "Vela Grey", "Focus", "Podcasts"];

function pluralFor(mediaType: string): string {
  return `${mediaType}s`;
}

export function SearchScreen() {
  const app = useApp();
  const nav = useNav();
  const play = usePlayActions();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const [sheetItem, setSheetItem] = useState<ItemMapping | MediaItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { send, baseUrl } = app;

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = window.setTimeout(() => {
      void send<SearchResults>("music/search", {
        search_query: trimmed,
        media_types: ["track", "album", "artist", "playlist", "radio", "podcast"],
        limit: 24,
        library_only: false,
      })
        .then((res) => setResults(res ?? {}))
        .catch(() => setResults({}))
        .finally(() => setBusy(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, send]);

  const rememberSearch = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const next = [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(0, 6);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const openMedia = (item: MediaItem) => {
    rememberSearch(query);
    const type = item.media_type ?? "";
    if (["album", "playlist", "artist", "genre", "podcast", "audiobook"].includes(type)) {
      nav.push({ name: "media", item });
    } else {
      play.play(item);
    }
  };

  const groups: Array<{ key: Filter; title: string; items: MediaItem[] }> = results
    ? ([
        { key: "track" as Filter, title: "Songs", items: results.tracks ?? [] },
        { key: "album" as Filter, title: "Albums", items: results.albums ?? [] },
        { key: "artist" as Filter, title: "Artists", items: results.artists ?? [] },
        { key: "playlist" as Filter, title: "Playlists", items: results.playlists ?? [] },
        { key: "radio" as Filter, title: "Stations", items: results.radios ?? [] },
        { key: "podcast" as Filter, title: "Podcasts", items: results.podcasts ?? [] },
      ] as Array<{ key: Filter; title: string; items: MediaItem[] }>).filter(
        (group) => group.items.length,
      )
    : [];

  const visibleGroups = filter === "all" ? groups : groups.filter((group) => group.key === filter);
  const topResult = results?.tracks?.[0] ?? results?.albums?.[0] ?? results?.artists?.[0];

  return (
    <>
      <TopBar
        title="Search"
        right={
          query ? (
            <button className="text-btn" onClick={() => { setQuery(""); inputRef.current?.focus(); }}>
              Cancel
            </button>
          ) : null
        }
      />
      <div className="searchbar">
        <Icon name="search" size={18} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onBlur={() => rememberSearch(query)}
          placeholder="Artists, songs, albums, stations"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search Music Assistant"
          enterKeyHint="search"
        />
        {query ? (
          <button className="searchbar__clear" onClick={() => setQuery("")} aria-label="Clear">
            <Icon name="x" size={16} />
          </button>
        ) : null}
      </div>

      {!query ? (
        <>
          {history.length ? (
            <Section title="Recent searches">
              <div className="rows">
                {history.map((entry) => (
                  <MediaRow
                    key={entry}
                    title={entry}
                    icon="search"
                    onClick={() => {
                      setQuery(entry);
                      inputRef.current?.focus();
                    }}
                    trail={
                      <button
                        className="row__trail-btn"
                        aria-label={`Remove ${entry}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          const next = history.filter((item) => item !== entry);
                          setHistory(next);
                          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
                        }}
                      >
                        <Icon name="x" size={14} />
                      </button>
                    }
                  />
                ))}
              </div>
            </Section>
          ) : null}

          <Section title="Browse">
            <div className="chips chips--wrap">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} className="chip" onClick={() => setQuery(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Your library">
            <div className="rows">
              {["album", "artist", "playlist", "track", "radio", "genre"].map((mediaType) => (
                <MediaRow
                  key={mediaType}
                  title={
                    mediaType === "track"
                      ? "Songs"
                      : mediaType === "radio"
                        ? "Radio"
                        : mediaType === "genre"
                          ? "Genres"
                          : pluralFor(mediaType).replace(/^./, (c) => c.toUpperCase())
                  }
                  icon={mediaType === "album" ? "album" : mediaType === "artist" ? "artist" : "music"}
                  trail={<Icon name="chevronRight" size={18} />}
                  onClick={() =>
                    nav.push({
                      name: "browse",
                      title: mediaType === "track" ? "Songs" : pluralFor(mediaType),
                      query: { kind: "library", mediaType },
                    })
                  }
                />
              ))}
            </div>
          </Section>

          <EmptyState
            icon="search"
            title="Search Music Assistant"
            body="Results come from your library and every music provider connected to your Music Assistant server."
          />
        </>
      ) : busy && !results ? (
        <Spinner label="Searching" />
      ) : (
        <>
          <Chips options={FILTERS} value={filter} onChange={setFilter} />

          {topResult && filter === "all" ? (
            <Section title="Top result">
              <button className="top-result" onClick={() => openMedia(topResult)}>
                <Artwork
                  image={itemImage(topResult)}
                  seed={itemSeed(topResult)}
                  baseUrl={baseUrl}
                  radius={8}
                  width={96}
                  height={96}
                  requestSize={512}
                  alt={topResult.name}
                />
                <span className="top-result__body">
                  <span className="top-result__name">{topResult.name}</span>
                  <span className="top-result__sub">{itemSubtitle(topResult)}</span>
                  <span className="top-result__type">{topResult.media_type}</span>
                </span>
                <span className="top-result__play" aria-hidden="true">
                  <Icon name="play" size={18} />
                </span>
              </button>
            </Section>
          ) : null}

          {visibleGroups.length === 0 && !busy ? (
            <EmptyState
              icon="search"
              title={`No results for “${query}”`}
              body="Try a different spelling, or check that a music provider is connected."
            />
          ) : null}

          {visibleGroups.map((group) => (
            <Section key={group.key} title={group.title}>
              <div className="rows">
                {group.items.slice(0, filter === "all" ? 4 : 40).map((item, index) => (
                  <MediaRow
                    key={`${item.uri ?? item.name}-${index}`}
                    title={item.name}
                    subtitle={itemSubtitle(item)}
                    image={itemImage(item)}
                    seed={itemSeed(item)}
                    baseUrl={baseUrl}
                    surface
                    round={item.media_type === "artist"}
                    onClick={() => openMedia(item)}
                    onMenu={() => setSheetItem(item)}
                  />
                ))}
              </div>
            </Section>
          ))}

          {busy ? <Spinner /> : null}
        </>
      )}

      <ItemActionsSheet item={sheetItem} onClose={() => setSheetItem(null)} />
    </>
  );
}
