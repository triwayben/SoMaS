import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createDemoBackend } from "./api/demo";
import { MasBackend, normalizeBaseUrl } from "./api/mas";
import type {
  Backend,
  ConnState,
  MasEvent,
  MusicProvider,
  Player,
  PlayerQueue,
  QueueItem,
  ServerInfo,
} from "./api/types";
import { permissionsFrom, UNRESTRICTED, type Permissions } from "./lib/permissions";
import { leaderOf, queueFor } from "./lib/players";
import { accountHash as hashAccount, readPrefJson, scopedKey, setPrefScope, writePrefJson } from "./lib/prefs";

const STORAGE = {
  server: "somas.server",
  token: "somas.token",
  selected: "somas.player",
  theme: "somas.theme",
  demo: "somas.demo",
  usage: "somas.usage",
  account: "somas.account",
};

export type Phase = "welcome" | "connecting" | "ready" | "error";

export interface AppState {
  phase: Phase;
  error?: string;
  backendKind: "mas" | "demo";
  connState: ConnState;
  reconnectingDetail?: string;
  serverInfo: ServerInfo | null;
  baseUrl: string;
  players: Record<string, Player>;
  queues: Record<string, PlayerQueue>;
  providers: MusicProvider[];
  configProviders: Array<Record<string, unknown>>;
  selectedId: string | null;
  queueItems: Record<string, QueueItem[]>;
  /** Who is signed in and what the server lets them do. */
  permissions: Permissions;
}

interface ConnectOptions {
  baseUrl?: string;
  token?: string;
  demo?: boolean;
  remember?: boolean;
  /** Already-hashed identity, so reconnecting lands on the same settings the session saved. */
  accountHash?: string;
}

export interface AppActions {
  connect: (options: ConnectOptions) => Promise<void>;
  connectDemo: () => Promise<void>;
  disconnect: () => void;
  selectPlayer: (playerId: string) => void;
  send: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
  loadQueue: (queueId: string) => Promise<void>;
  playMedia: (playerId: string, uri: string | string[], option?: "play" | "next" | "add") => Promise<void>;
  togglePlay: (playerId: string) => Promise<void>;
  next: (playerId: string) => Promise<void>;
  previous: (playerId: string) => Promise<void>;
  seek: (queueId: string, seconds: number) => Promise<void>;
  setVolume: (playerId: string, level: number) => Promise<void>;
  toggleMute: (playerId: string) => Promise<void>;
  setShuffle: (queueId: string, enabled: boolean) => Promise<void>;
  cycleRepeat: (queueId: string) => Promise<void>;
  setGroupMembers: (
    targetId: string,
    add: string[],
    remove: string[],
  ) => Promise<void>;
  selectSource: (playerId: string, source: string) => Promise<void>;
  setOption: (playerId: string, key: string, value: string | number | boolean) => Promise<void>;
  selectSoundMode: (playerId: string, mode: string) => Promise<void>;
  playIndex: (queueId: string, index: number) => Promise<void>;
  removeQueueItem: (queueId: string, itemId: string) => Promise<void>;
  clearQueue: (queueId: string) => Promise<void>;
  setFavorite: (uri: string, favorite: boolean, mediaType?: string, itemId?: string) => Promise<void>;
  setSleepTimer: (playerId: string, seconds: number) => Promise<void>;
  notify: (message: string) => void;
  dismissToast: () => void;
  lastError?: string;
  toast?: string;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

/**
 * Music Assistant renamed this command over time: `providers` (2.10+) lists loaded
 * provider instances, older builds answered `music/sources`, and `config/providers`
 * returns provider configs. Try them in order so the app works across versions.
 */
async function fetchProviders(backend: Backend): Promise<MusicProvider[]> {
  for (const command of ["providers", "music/sources", "config/providers"]) {
    try {
      const result = await backend.send<MusicProvider[]>(command);
      if (Array.isArray(result) && result.length) {
        return result.filter((provider) => Boolean(provider?.instance_id || provider?.domain));
      }
    } catch {
      // Try the next command name.
    }
  }
  return [];
}

/** Ask the server who this token belongs to. A server too old to answer leaves everything on. */
async function readPermissions(backend: Backend): Promise<Permissions> {
  try {
    const user = await backend.send("auth/me");
    let roleScopes: unknown;
    try {
      roleScopes = await backend.send("auth/scopes");
    } catch {
      roleScopes = undefined;
    }
    return permissionsFrom(user, roleScopes);
  } catch {
    return UNRESTRICTED;
  }
}

const initialState: AppState = {
  phase: "welcome",
  backendKind: "mas",
  connState: "idle",
  serverInfo: null,
  baseUrl: "",
  players: {},
  queues: {},
  providers: [],
  configProviders: [],
  selectedId: null,
  queueItems: {},
  permissions: UNRESTRICTED,
};

function pickDefaultPlayer(players: Player[], previous: string | null): string | null {
  if (previous && players.some((player) => player.player_id === previous)) return previous;
  const playingLeader = players.find(
    (player) =>
      !player.synced_to && (player.playback_state === "playing" || player.state === "playing"),
  );
  if (playingLeader) return playingLeader.player_id;
  const withQueue = players.find((player) => player.active_source);
  if (withQueue) return withQueue.player_id;
  return players[0]?.player_id ?? null;
}

/**
 * Keeps the item object we already have when the server reports the same track again. Polling the
 * position returns a fresh copy every couple of seconds, and handing that copy to the artwork and
 * text rows makes them rebuild for no reason (artwork flashes, rows shift).
 */
function sameItem(previous?: QueueItem | null, next?: QueueItem | null) {
  if (!previous) return next ?? null;
  if (!next) return null;
  return previous.queue_item_id === next.queue_item_id ? previous : next;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [toast, setToast] = useState<string | undefined>();
  const backendRef = useRef<Backend | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    // Long enough to read a sentence, and the toast can be dismissed before it goes on its own.
    toastTimer.current = window.setTimeout(() => setToast(undefined), 4200);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setToast(undefined);
  }, []);

  const loadQueue = useCallback(async (queueId: string) => {
    const backend = backendRef.current;
    if (!backend) return;
    try {
      const items = await backend.send<QueueItem[]>("player_queues/items", {
        queue_id: queueId,
        limit: 500,
        offset: 0,
      });
      setState((prev) => ({
        ...prev,
        queueItems: { ...prev.queueItems, [queueId]: items ?? [] },
      }));
    } catch {
      // Non-fatal: the queue pane shows an empty state.
    }
  }, []);

  const handleEvent = useCallback(
    (event: MasEvent) => {
      const name = event.event;
      const data = event.data as Record<string, unknown> | null | undefined;
      if (!name) return;

      if (name === "player_added" || name === "player_updated") {
        const player = data as unknown as Player;
        if (!player?.player_id) return;
        setState((prev) => ({
          ...prev,
          players: { ...prev.players, [player.player_id]: player },
        }));
        return;
      }
      if (name === "player_removed") {
        setState((prev) => {
          const players = { ...prev.players };
          if (event.object_id) delete players[event.object_id];
          return { ...prev, players };
        });
        return;
      }
      if (name === "queue_time_updated") {
        // Music Assistant sends only the elapsed seconds here, with the queue id as the object
        // id - not a queue object. Re-anchor the position so the progress bar keeps moving.
        const seconds =
          typeof data === "number"
            ? data
            : (data as { elapsed_time?: number } | null)?.elapsed_time;
        const queueId = event.object_id;
        if (!queueId || typeof seconds !== "number") return;
        setState((prev) => {
          const queue = prev.queues[queueId];
          if (!queue) return prev;
          return {
            ...prev,
            queues: {
              ...prev.queues,
              [queueId]: {
                ...queue,
                elapsed_time: seconds,
                elapsed_time_last_updated: Date.now() / 1000,
              },
            },
          };
        });
        return;
      }
      if (name === "queue_added" || name === "queue_updated") {
        const queue = data as unknown as PlayerQueue;
        if (!queue?.queue_id) return;
        setState((prev) => ({
          ...prev,
          queues: { ...prev.queues, [queue.queue_id]: queue },
        }));
        return;
      }
      if (name === "queue_items_updated") {
        if (event.object_id && stateRef.current.queueItems[event.object_id]) {
          void loadQueue(event.object_id);
        }
        return;
      }
      if (
        name === "provider_added" ||
        name === "provider_updated" ||
        name === "provider_removed" ||
        name === "providers_updated"
      ) {
        const backend = backendRef.current;
        if (!backend) return;
        void fetchProviders(backend).then((providers) => {
          if (providers.length) setState((prev) => ({ ...prev, providers }));
        });
        return;
      }
      if (name === "music_sync_completed") {
        notify("Music library scan finished");
      }
    },
    [loadQueue, notify],
  );

  const hydrate = useCallback(async (backend: Backend) => {
    const [players, queues, providers, configProviders] = await Promise.all([
      backend.send<Player[]>("players/all").catch(() => [] as Player[]),
      backend.send<PlayerQueue[]>("player_queues/all").catch(() => [] as PlayerQueue[]),
      fetchProviders(backend),
      backend
        .send<Array<Record<string, unknown>>>("config/providers")
        .catch(() => [] as Array<Record<string, unknown>>),
    ]);

    const playerMap = Object.fromEntries((players ?? []).map((player) => [player.player_id, player]));
    const queueMap = Object.fromEntries((queues ?? []).map((queue) => [queue.queue_id, queue]));

    setState((prev) => {
      const stored = localStorage.getItem(scopedKey(STORAGE.selected));
      const selected = pickDefaultPlayer(players ?? [], prev.selectedId ?? stored);
      return {
        ...prev,
        phase: "ready",
        error: undefined,
        players: playerMap,
        queues: queueMap,
        providers: providers ?? [],
        configProviders: configProviders ?? [],
        selectedId: selected,
      };
    });
  }, []);

  const teardown = useCallback(() => {
    backendRef.current?.close();
    backendRef.current = null;
  }, []);

  const connect = useCallback(
    async ({
      baseUrl = "",
      token = "",
      demo = false,
      remember = true,
      accountHash,
    }: ConnectOptions) => {
      teardown();
      // Keep one canonical absolute origin in state. Artwork and links are built from it, so a
      // scheme-less "host:8095" would otherwise resolve against this app's own address.
      let base = "";
      if (!demo) {
        try {
          base = normalizeBaseUrl(baseUrl);
        } catch (err) {
          setState((prev) => ({ ...prev, phase: "error", error: (err as Error).message }));
          return;
        }
      }
      // Layout, theme and pins belong to one server *and* one account, so point the preference
      // store at both before any screen reads them. The demo system keeps its own sandbox settings.
      const identity = accountHash ?? (token ? hashAccount(token) : "");
      setPrefScope(demo ? "demo" : identity ? `${base}|${identity}` : base);

      setState(() => ({
        ...initialState,
        phase: "connecting",
        backendKind: demo ? "demo" : "mas",
        connState: "connecting",
        baseUrl: base,
      }));

      let backend: Backend;
      try {
        backend = demo ? createDemoBackend() : new MasBackend(base, token);
      } catch (err) {
        setState((prev) => ({ ...prev, phase: "error", error: (err as Error).message }));
        return;
      }
      backendRef.current = backend;

      backend.onState((conn: ConnState, detail?: string) => {
        if (backendRef.current !== backend) return;
        setState((prev) => {
          if (conn === "connected" && prev.phase === "ready") {
            // Reconnect: re-pull authoritative state, and the role in case it was changed.
            void hydrate(backend);
            void readPermissions(backend).then((permissions) =>
              setState((current) => ({ ...current, permissions })),
            );
          }
          return {
            ...prev,
            connState: conn,
            reconnectingDetail: conn === "reconnecting" ? detail : undefined,
          };
        });
      });
      backend.onEvent(handleEvent);

      try {
        const info = await backend.connect();
        await hydrate(backend);
        if (remember && !demo) {
          localStorage.setItem(STORAGE.server, base);
          localStorage.setItem(STORAGE.token, token);
          localStorage.setItem(STORAGE.account, identity);
          localStorage.removeItem(STORAGE.demo);
        }
        if (demo) {
          localStorage.setItem(STORAGE.demo, "1");
          localStorage.removeItem(STORAGE.server);
          localStorage.removeItem(STORAGE.token);
          localStorage.removeItem(STORAGE.account);
        }
        const permissions = await readPermissions(backend);
        setState((prev) => ({ ...prev, serverInfo: info, baseUrl: base, permissions }));
      } catch (err) {
        backend.close();
        backendRef.current = null;
        setState((prev) => ({
          ...prev,
          phase: "error",
          error: (err as Error).message || "Could not connect",
        }));
      }
    },
    [handleEvent, hydrate, teardown],
  );

  const connectDemo = useCallback(async () => {
    await connect({ demo: true });
  }, [connect]);

  const disconnect = useCallback(() => {
    teardown();
    localStorage.removeItem(STORAGE.server);
    localStorage.removeItem(STORAGE.token);
    localStorage.removeItem(STORAGE.demo);
    localStorage.removeItem(STORAGE.account);
    setState(initialState);
  }, [teardown]);

  // Restore a previous session on first load.
  useEffect(() => {
    const demo = localStorage.getItem(STORAGE.demo) === "1";
    const server = localStorage.getItem(STORAGE.server) ?? "";
    const token = localStorage.getItem(STORAGE.token) ?? "";
    // Reuse the identity this session was saved under, so a password login lands on its settings
    // even though the token it received is new.
    const accountHash = localStorage.getItem(STORAGE.account) ?? undefined;
    if (demo) {
      void connect({ demo: true });
    } else if (server) {
      void connect({ baseUrl: server, token, accountHash });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Progress watchdog. The position must keep moving even when the server pushes no per-second
  // update for it (some players only report on state changes), so while something is playing the
  // app re-reads the clock straight from the server. Events still drive everything else.
  const anyPlaying = Object.values(state.players).some(
    (player) => (player.playback_state ?? player.state) === "playing",
  );
  const lastSample = useRef<{ queueId: string; base: number; changedAt: number } | null>(null);
  useEffect(() => {
    if (state.phase !== "ready" || state.backendKind !== "mas" || !anyPlaying) return;
    let cancelled = false;

    const refreshPosition = async () => {
      const backend = backendRef.current;
      if (!backend || cancelled) return;
      const { players, queues, selectedId } = stateRef.current;
      const player = leaderOf(players, selectedId);
      if (!player) return;
      const queue = queueFor(players, queues, selectedId);
      const [freshPlayer, freshQueue] = await Promise.all([
        backend.send<Player>("players/get", { player_id: player.player_id }).catch(() => null),
        queue
          ? backend
              .send<PlayerQueue>("player_queues/get", { queue_id: queue.queue_id })
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (cancelled || (!freshPlayer && !freshQueue)) return;
      // If the server keeps returning the same position while playing, its clock is not moving
      // (a stuck source or a player that never reports); keep time ourselves from the last
      // change so the bar never freezes.
      const now = Date.now() / 1000;
      let elapsed = freshQueue?.elapsed_time ?? null;
      let anchor = freshQueue?.elapsed_time_last_updated ?? null;
      if (freshQueue?.queue_id) {
        const base = freshQueue.elapsed_time ?? 0;
        const sample = lastSample.current;
        if (!sample || sample.queueId !== freshQueue.queue_id || Math.abs(base - sample.base) > 0.5) {
          lastSample.current = { queueId: freshQueue.queue_id, base, changedAt: now };
        } else if ((freshQueue.state ?? "") === "playing") {
          // The reported position is the one we last saw change, so carry it forward from there.
          // A server that keeps advancing resets this every poll, so nothing accumulates.
          elapsed = Math.max(base, base + (now - sample.changedAt));
          anchor = now;
        }
      }
      setState((prev) => {
        let next = prev;
        if (freshPlayer?.player_id) {
          next = {
            ...next,
            players: {
              ...next.players,
              [freshPlayer.player_id]: {
                ...next.players[freshPlayer.player_id],
                // Only the clock and the state: volumes and names stay from events and local edits.
                elapsed_time: freshPlayer.elapsed_time,
                elapsed_time_last_updated: freshPlayer.elapsed_time_last_updated,
                playback_state: freshPlayer.playback_state,
                state: freshPlayer.state,
              },
            },
          };
        }
        if (freshQueue?.queue_id) {
          const existing = next.queues[freshQueue.queue_id];
          next = {
            ...next,
            queues: {
              ...next.queues,
              [freshQueue.queue_id]: {
                ...existing,
                elapsed_time: elapsed ?? freshQueue.elapsed_time,
                elapsed_time_last_updated: anchor ?? freshQueue.elapsed_time_last_updated,
                state: freshQueue.state,
                // Picks up a track change even if that event was missed, without churning the
                // object (and the artwork) when the track has not changed.
                current_item: sameItem(existing?.current_item, freshQueue.current_item),
                next_item: sameItem(existing?.next_item, freshQueue.next_item),
              },
            },
          };
        }
        return next;
      });
    };

    // Coming back to the app should not wait for the next tick: re-read the clock right away.
    const onVisible = () => void refreshPosition();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("focus", onVisible);
    void refreshPosition();
    const timer = window.setInterval(() => void refreshPosition(), 2000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("focus", onVisible);
      window.clearInterval(timer);
    };
  }, [anyPlaying, state.backendKind, state.phase]);

  const selectPlayer = useCallback((playerId: string) => {
    localStorage.setItem(scopedKey(STORAGE.selected), playerId);
    try {
      const usage = readPrefJson<Record<string, number>>("usage", {}, STORAGE.usage);
      usage[playerId] = (usage[playerId] ?? 0) + 1;
      writePrefJson("usage", usage);
      window.dispatchEvent(new Event("somas:usage"));
    } catch {
      /* usage counts are best-effort */
    }
    setState((prev) => ({ ...prev, selectedId: playerId }));
  }, []);

  const send = useCallback(
    async <T,>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
      const backend = backendRef.current;
      if (!backend) throw new Error("Not connected");
      return backend.send<T>(command, args);
    },
    [],
  );

  const resolveQueueId = useCallback((playerId: string): string => {
    const { players, queues } = stateRef.current;
    const queue = queueFor(players, queues, playerId);
    return queue?.queue_id ?? playerId;
  }, []);

  const playMedia = useCallback(
    async (playerId: string, uri: string | string[], option: "play" | "next" | "add" = "play") => {
      const queueId = resolveQueueId(playerId);
      const media = Array.isArray(uri) ? uri : [uri];
      try {
        await send("player_queues/play_media", { queue_id: queueId, media, option });
        notify(option === "next" ? "Playing next" : option === "add" ? "Added to queue" : "Playing");
      } catch (err) {
        notify((err as Error).message || "Could not start playback");
      }
    },
    [notify, resolveQueueId, send],
  );

  const queueCommand = useCallback(
    async (command: string, queueId: string, args: Record<string, unknown> = {}) => {
      try {
        await send(command, { queue_id: queueId, ...args });
      } catch (err) {
        notify((err as Error).message || "Command failed");
      }
    },
    [notify, send],
  );

  const togglePlay = useCallback(
    async (playerId: string) => {
      const queueId = resolveQueueId(playerId);
      await queueCommand("player_queues/play_pause", queueId);
    },
    [queueCommand, resolveQueueId],
  );

  const next = useCallback(
    async (playerId: string) => {
      await queueCommand("player_queues/next", resolveQueueId(playerId));
    },
    [queueCommand, resolveQueueId],
  );

  const previous = useCallback(
    async (playerId: string) => {
      await queueCommand("player_queues/previous", resolveQueueId(playerId));
    },
    [queueCommand, resolveQueueId],
  );

  const seek = useCallback(
    async (queueId: string, seconds: number) => {
      setState((prev) => {
        const queue = prev.queues[queueId];
        if (!queue) return prev;
        return {
          ...prev,
          queues: {
            ...prev.queues,
            [queueId]: { ...queue, elapsed_time: seconds, elapsed_time_last_updated: Date.now() / 1000 },
          },
        };
      });
      await queueCommand("player_queues/seek", queueId, { position: Math.round(seconds) });
    },
    [queueCommand],
  );

  const setVolume = useCallback(
    async (playerId: string, level: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(level)));
      const player = stateRef.current.players[playerId];
      const children = player?.group_members ?? player?.group_childs ?? [];
      setState((prev) => {
        const players = { ...prev.players };
        const target = players[playerId];
        if (target) {
          players[playerId] = { ...target, volume_level: clamped };
          for (const childId of children) {
            const child = players[childId];
            if (child) players[childId] = { ...child, volume_level: clamped };
          }
        }
        return { ...prev, players };
      });
      try {
        if (children.length > 1) {
          await send("players/cmd/group_volume", { player_id: playerId, volume_level: clamped });
        } else {
          await send("players/cmd/volume_set", { player_id: playerId, volume_level: clamped });
        }
      } catch (err) {
        notify((err as Error).message || "Could not set volume");
      }
    },
    [notify, send],
  );

  const toggleMute = useCallback(
    async (playerId: string) => {
      const player = stateRef.current.players[playerId];
      const muted = !player?.volume_muted;
      setState((prev) => {
        const players = { ...prev.players };
        if (players[playerId]) players[playerId] = { ...players[playerId], volume_muted: muted };
        return { ...prev, players };
      });
      try {
        await send("players/cmd/volume_mute", { player_id: playerId, muted });
      } catch (err) {
        notify((err as Error).message || "Could not mute");
      }
    },
    [notify, send],
  );

  const setShuffle = useCallback(
    async (queueId: string, enabled: boolean) => {
      setState((prev) => {
        const queue = prev.queues[queueId];
        if (!queue) return prev;
        return {
          ...prev,
          queues: { ...prev.queues, [queueId]: { ...queue, shuffle_enabled: enabled } },
        };
      });
      await queueCommand("player_queues/shuffle", queueId, { shuffle_enabled: enabled });
    },
    [queueCommand],
  );

  const cycleRepeat = useCallback(
    async (queueId: string) => {
      const current = stateRef.current.queues[queueId]?.repeat_mode ?? "off";
      const nextMode = current === "off" ? "all" : current === "all" ? "one" : "off";
      setState((prev) => {
        const queue = prev.queues[queueId];
        if (!queue) return prev;
        return {
          ...prev,
          queues: { ...prev.queues, [queueId]: { ...queue, repeat_mode: nextMode } },
        };
      });
      await queueCommand("player_queues/repeat", queueId, { repeat_mode: nextMode });
    },
    [queueCommand],
  );

  const setGroupMembers = useCallback(
    async (targetId: string, add: string[], remove: string[]) => {
      try {
        await send("players/cmd/set_members", {
          target_player: targetId,
          player_ids_to_add: add,
          player_ids_to_remove: remove,
        });
      } catch (err) {
        notify((err as Error).message || "Could not update the group");
      }
    },
    [notify, send],
  );

  const selectSource = useCallback(
    async (playerId: string, source: string) => {
      try {
        await send("players/cmd/select_source", { player_id: playerId, source });
      } catch (err) {
        notify((err as Error).message || "Could not switch input");
      }
    },
    [notify, send],
  );

  const setOption = useCallback(
    async (playerId: string, key: string, value: string | number | boolean) => {
      setState((prev) => {
        const player = prev.players[playerId];
        if (!player?.options) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            [playerId]: {
              ...player,
              options: player.options.map((option) =>
                option.key === key ? { ...option, value } : option,
              ),
            },
          },
        };
      });
      try {
        await send("players/cmd/set_option", {
          player_id: playerId,
          option_key: key,
          option_value: value,
        });
      } catch (err) {
        notify((err as Error).message || "Could not change that setting");
      }
    },
    [notify, send],
  );

  const selectSoundMode = useCallback(
    async (playerId: string, mode: string) => {
      try {
        await send("players/cmd/select_sound_mode", { player_id: playerId, sound_mode: mode });
      } catch (err) {
        notify((err as Error).message || "Could not change sound mode");
      }
    },
    [notify, send],
  );

  const playIndex = useCallback(
    async (queueId: string, index: number) => {
      await queueCommand("player_queues/play_index", queueId, { index });
    },
    [queueCommand],
  );

  const removeQueueItem = useCallback(
    async (queueId: string, itemId: string) => {
      setState((prev) => {
        const items = prev.queueItems[queueId];
        if (!items) return prev;
        return {
          ...prev,
          queueItems: {
            ...prev.queueItems,
            [queueId]: items.filter((item) => item.queue_item_id !== itemId),
          },
        };
      });
      await queueCommand("player_queues/delete_item", queueId, { item_id_or_index: itemId });
    },
    [queueCommand],
  );

  const clearQueue = useCallback(
    async (queueId: string) => {
      setState((prev) => ({ ...prev, queueItems: { ...prev.queueItems, [queueId]: [] } }));
      await queueCommand("player_queues/clear", queueId);
    },
    [queueCommand],
  );

  const setFavorite = useCallback(
    async (uri: string, favorite: boolean, mediaType?: string, itemId?: string) => {
      if (!stateRef.current.permissions.libraryWrite) {
        notify("Your Music Assistant account can only read the library");
        return;
      }
      try {
        if (favorite) {
          await send("music/favorites/add_item", { item: uri });
          notify("Added to favorites");
        } else if (mediaType && itemId) {
          await send("music/favorites/remove_item", {
            media_type: mediaType,
            library_item_id: itemId,
          });
          notify("Removed from favorites");
        }
      } catch (err) {
        notify((err as Error).message || "Could not update favorites");
      }
    },
    [notify, send],
  );

  const setSleepTimer = useCallback(
    async (playerId: string, seconds: number) => {
      try {
        if (seconds <= 0) {
          await send("players/sleep_timer/clear", { player_id: playerId });
          notify("Sleep timer cleared");
        } else {
          await send("players/sleep_timer/set", { player_id: playerId, seconds });
          notify(`Sleep timer set for ${Math.round(seconds / 60)} min`);
        }
      } catch (err) {
        notify((err as Error).message || "Sleep timer is not available");
      }
    },
    [notify, send],
  );

  const value = useMemo(
    () => ({
      ...state,
      connect,
      connectDemo,
      disconnect,
      selectPlayer,
      send,
      loadQueue,
      playMedia,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      setShuffle,
      cycleRepeat,
      setGroupMembers,
      selectSource,
      setOption,
      selectSoundMode,
      playIndex,
      removeQueueItem,
      clearQueue,
      setFavorite,
      setSleepTimer,
      notify,
      dismissToast,
      toast,
      lastError: undefined,
    }),
    [
      state,
      connect,
      connectDemo,
      disconnect,
      selectPlayer,
      send,
      loadQueue,
      playMedia,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      setShuffle,
      cycleRepeat,
      setGroupMembers,
      selectSource,
      setOption,
      selectSoundMode,
      playIndex,
      removeQueueItem,
      clearQueue,
      setFavorite,
      setSleepTimer,
      notify,
      dismissToast,
      toast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}

export { STORAGE };
