import { createContext, useContext } from "react";
import type { MediaItem } from "./api/types";

export type TabName = "home" | "system" | "search";

export type BrowseQuery =
  | { kind: "library"; mediaType: string }
  | { kind: "path"; path: string }
  | { kind: "recommendation"; provider: string; itemId: string };

export type Route =
  | { name: "home" }
  | { name: "system" }
  | { name: "search" }
  | { name: "browse"; title: string; query: BrowseQuery }
  | { name: "media"; item: MediaItem }
  | { name: "player"; playerId: string }
  | { name: "profile" }
  | { name: "settings" };

export interface NavValue {
  tab: TabName;
  route: Route;
  canGoBack: boolean;
  goTab: (tab: TabName) => void;
  push: (route: Route) => void;
  back: () => void;
  openNowPlaying: () => void;
  openQueue: () => void;
  closeOverlay: () => void;
}

export const NavContext = createContext<NavValue | null>(null);

export function useNav(): NavValue {
  const value = useContext(NavContext);
  if (!value) throw new Error("useNav must be used inside NavContext");
  return value;
}
