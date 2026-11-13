import type { Player } from "../api/types";

export interface GroupPreset {
  id: string;
  name: string;
  /** Room ids, host first. */
  members: string[];
  usedAt: number;
}

const STORAGE_KEY = "somas.groupPresets";
const MAX_PRESETS = 4;

export function readGroupPresets(): GroupPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (entry): entry is GroupPreset =>
        Boolean(entry) &&
        typeof entry.id === "string" &&
        typeof entry.name === "string" &&
        Array.isArray(entry.members) &&
        entry.members.every((id: unknown) => typeof id === "string"),
    );
  } catch {
    return [];
  }
}

/** The same rooms in a different order are the same grouping. */
function presetKey(members: string[]): string {
  return [...members].sort().join("|");
}

function presetName(players: Record<string, Player>, targetId: string, members: string[]): string {
  const host = players[targetId]?.name ?? "Room";
  const others = members
    .filter((id) => id !== targetId)
    .map((id) => players[id]?.name ?? "")
    .filter(Boolean);
  if (!others.length) return host;
  if (others.length === 1) return `${host} + ${others[0]}`;
  return `${host} + ${others[0]} +${others.length - 1}`;
}

/** Remembers the grouping the user just applied, newest first. */
export function rememberGrouping(
  players: Record<string, Player>,
  targetId: string,
  selectedIds: string[],
): GroupPreset[] {
  const current = readGroupPresets();
  const members = [targetId, ...selectedIds.filter((id) => id !== targetId && players[id])];
  const roomCount = Object.keys(players).length;
  // "This room only" and "All speakers" already have permanent chips.
  if (members.length < 2 || members.length >= roomCount) return current;

  const preset: GroupPreset = {
    id: presetKey(members),
    name: presetName(players, targetId, members),
    members,
    usedAt: Date.now(),
  };
  const next = [preset, ...current.filter((entry) => entry.id !== preset.id)].slice(0, MAX_PRESETS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* presets are best effort */
  }
  return next;
}
