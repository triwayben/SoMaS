import { useEffect, useRef, type ReactNode } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  full?: boolean;
  headerRight?: ReactNode;
  subtitle?: string;
  footer?: ReactNode;
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  full,
  headerRight,
  footer,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const dragOffset = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDragStart = (event: React.PointerEvent) => {
    dragStart.current = event.clientY;
    dragOffset.current = 0;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: React.PointerEvent) => {
    if (dragStart.current == null) return;
    dragOffset.current = Math.max(0, event.clientY - dragStart.current);
    if (panelRef.current) {
      panelRef.current.style.transform = `translateY(${dragOffset.current}px)`;
    }
  };

  const handleDragEnd = () => {
    if (dragStart.current == null) return;
    dragStart.current = null;
    if (dragOffset.current > 90) onClose();
    if (panelRef.current) panelRef.current.style.transform = "";
    dragOffset.current = 0;
  };

  return (
    <div className={`sheet ${full ? "sheet--full" : ""}`} role="dialog" aria-modal="true">
      <button className="sheet__backdrop" aria-label="Close" onClick={onClose} />
      <div className={`sheet__panel ${footer ? "has-footer" : ""}`} ref={panelRef}>
        <div
          className="sheet__grab-area"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div className="sheet__grab" />
        </div>
        {title ? (
          <div className="sheet__header">
            <div>
              <h2 className="sheet__title">{title}</h2>
              {subtitle ? <p className="sheet__subtitle">{subtitle}</p> : null}
            </div>
            {headerRight ?? (
              <button className="icon-btn" onClick={onClose} aria-label="Close">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
        ) : null}
        <div className="sheet__body">{children}</div>
        {footer ? <div className="sheet__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
