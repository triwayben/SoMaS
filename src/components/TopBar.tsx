import type { ReactNode } from "react";
import { useApp } from "../store";
import { GuestBadge } from "./GuestBadge";
import { Icon } from "./Icon";

export function TopBar({
  title,
  subtitle,
  onTitle,
  onBack,
  right,
  brand,
}: {
  title: string;
  subtitle?: string;
  onTitle?: () => void;
  onBack?: () => void;
  right?: ReactNode;
  /** The app's own mark and name instead of a title — used on Home, where the title was the room. */
  brand?: boolean;
}) {
  // A guest session looks almost like any other, so name it rather than let an absent control be
  // the only clue that this phone is not the owner's.
  const guest = useApp().permissions.role === "guest";
  return (
    <header className="topbar">
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="chevronLeft" size={24} />
        </button>
      ) : null}
      <div className="topbar__titles">
        {brand ? (
          <span className="topbar__brand">
            {/* Two files, one shown: the mark's outline is black, so on a dark page it needs the
                version whose ink is light. Only one is displayed, so neither costs any layout. */}
            <img
              className="topbar__mark topbar__mark--onlight"
              src="/icons/icon-transparent-512.png"
              alt=""
              width={72}
              height={72}
            />
            <img
              className="topbar__mark topbar__mark--ondark"
              src="/icons/icon-light-512.png"
              alt=""
              width={72}
              height={72}
            />
            <span className="topbar__wordmark">SoMaS</span>
          </span>
        ) : onTitle ? (
          <button className="topbar__system" onClick={onTitle} type="button">
            <span>{title}</span>
            <Icon name="chevronDown" size={18} />
          </button>
        ) : (
          <h1 className="topbar__plain">{title}</h1>
        )}
        {subtitle ? <div className="topbar__sub">{subtitle}</div> : null}
      </div>
      <div className="topbar__spacer" />
      {guest ? <GuestBadge /> : null}
      {right}
    </header>
  );
}
