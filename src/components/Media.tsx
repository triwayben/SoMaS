import type { ReactNode } from "react";
import type { ItemMapping, MediaItem } from "../api/types";
import { itemImage, itemSeed, itemSubtitle } from "../lib/players";
import { mediaTypeLabel } from "../lib/format";
import { Artwork } from "./Artwork";
import { Icon, type IconName } from "./Icon";

export function Section({
  title,
  action,
  children,
  tight,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  tight?: boolean;
}) {
  return (
    <section className={`section ${tight ? "section--tight" : ""}`}>
      <div className="section__head">
        <h2 className="section__title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export interface MediaCardProps {
  item: ItemMapping | MediaItem;
  baseUrl?: string;
  onPress?: () => void;
  onMenu?: () => void;
  round?: boolean;
  subtitle?: string;
  badge?: string;
  surface?: boolean;
}

export function MediaCard({
  item,
  baseUrl,
  onPress,
  onMenu,
  round,
  subtitle,
  badge,
  surface,
}: MediaCardProps) {
  return (
    <div className={`card ${round ? "card--round" : ""} ${surface ? "card--surface" : ""}`}>
      <button className="card__button" onClick={onPress} type="button">
        <Artwork
          image={itemImage(item)}
          seed={itemSeed(item)}
          baseUrl={baseUrl}
          radius={surface ? 14 : round ? 999 : 6}
          requestSize={512}
          alt={item.name}
          className="card__art"
        />
        <div className="card__title">{item.name}</div>
        <div className="card__sub">
          {subtitle ?? (itemSubtitle(item) || mediaTypeLabel(item.media_type))}
        </div>
      </button>
      {badge ? <span className="card__badge">{badge}</span> : null}
      {onMenu ? (
        <button className="card__menu" onClick={onMenu} aria-label={`More options for ${item.name}`}>
          <Icon name="more" size={16} />
        </button>
      ) : null}
    </div>
  );
}

export function MediaRow({
  title,
  subtitle,
  image,
  seed,
  baseUrl,
  icon,
  trail,
  onClick,
  onMenu,
  active,
  leadingIndex,
  round,
  surface,
}: {
  title: string;
  subtitle?: string;
  image?: Parameters<typeof Artwork>[0]["image"];
  seed?: string;
  baseUrl?: string;
  icon?: IconName;
  trail?: ReactNode;
  onClick?: () => void;
  onMenu?: () => void;
  active?: boolean;
  leadingIndex?: number;
  round?: boolean;
  surface?: boolean;
}) {
  return (
    <div className={`row ${active ? "is-active" : ""} ${surface ? "row--surface" : ""}`}>
      <button className="row__main" onClick={onClick} type="button">
        {leadingIndex != null ? (
          <span className="row__index">{leadingIndex + 1}</span>
        ) : (
          <span className={`row__art ${icon ? "row__art--tile" : ""}`}>
            {icon ? (
              <Icon name={icon} size={22} />
            ) : (
              <Artwork
                image={image}
                seed={seed}
                baseUrl={baseUrl}
                radius={round ? 999 : surface ? 12 : 6}
                requestSize={256}
                alt={title}
              />
            )}
          </span>
        )}
        <span className="row__body">
          <span className="row__title">{title}</span>
          {subtitle ? <span className="row__sub">{subtitle}</span> : null}
        </span>
        {trail ? <span className="row__trail">{trail}</span> : null}
      </button>
      {onMenu ? (
        <button className="row__menu" onClick={onMenu} aria-label={`More options for ${title}`}>
          <Icon name="more" size={18} />
        </button>
      ) : null}
    </div>
  );
}

export function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="rail">
      <div className="rail__track">{children}</div>
    </div>
  );
}

export function EmptyState({
  icon = "music",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} size={26} />
      </div>
      <div className="empty__title">{title}</div>
      {body ? <div className="empty__body">{body}</div> : null}
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading">
      <div className="spinner" />
      {label ? <div className="loading__label">{label}</div> : null}
    </div>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="chips">
      {options.map((option) => (
        <button
          key={option.value}
          className={`chip ${option.value === value ? "is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
