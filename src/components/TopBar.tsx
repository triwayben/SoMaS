import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function TopBar({
  title,
  subtitle,
  onTitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onTitle?: () => void;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="topbar">
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="chevronLeft" size={24} />
        </button>
      ) : null}
      <div className="topbar__titles">
        {onTitle ? (
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
      {right}
    </header>
  );
}
