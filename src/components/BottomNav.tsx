import type { TabName } from "../nav";
import { queueFor } from "../lib/players";
import { useApp } from "../store";
import { CoverGlow } from "./CoverGlow";
import { Icon, type IconName } from "./Icon";

const TABS: Array<{ name: TabName; label: string; icon: IconName }> = [
  { name: "home", label: "Home", icon: "home" },
  { name: "system", label: "System", icon: "speaker" },
];

/** Floating dock navigation: a Home/System pill plus a round Search button. */
export function BottomNav({
  tab,
  onChange,
}: {
  tab: TabName;
  onChange: (tab: TabName) => void;
}) {
  const app = useApp();
  const queue = queueFor(app.players, app.queues, app.selectedId);

  return (
    <nav className="dock__nav" aria-label="Main">
      <div className="nav-pill">
        <CoverGlow queue={queue} baseUrl={app.baseUrl} />
        {TABS.map((entry) => (
          <button
            key={entry.name}
            className={`nav-item ${tab === entry.name ? "is-active" : ""}`}
            onClick={() => onChange(entry.name)}
            aria-current={tab === entry.name ? "page" : undefined}
          >
            <Icon name={entry.icon} size={21} strokeWidth={tab === entry.name ? 1.9 : 1.6} />
            <span>{entry.label}</span>
          </button>
        ))}
      </div>
      <button
        className={`nav-search ${tab === "search" ? "is-active" : ""}`}
        onClick={() => onChange("search")}
        aria-label="Search"
        aria-current={tab === "search" ? "page" : undefined}
      >
        <CoverGlow queue={queue} baseUrl={app.baseUrl} />
        <Icon name="search" size={24} strokeWidth={tab === "search" ? 2 : 1.7} />
      </button>
    </nav>
  );
}
