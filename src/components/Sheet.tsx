import { useEffect, useRef, useState, type ReactNode } from "react";

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
  const [dragging, setDragging] = useState(false);

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
    // A press that starts on a control (the close button, a header action) is a tap, not a
    // drag; capturing the pointer here would swallow its click.
    if ((event.target as HTMLElement).closest("button, a, input, [role='button']")) return;
    dragStart.current = event.clientY;
    dragOffset.current = 0;
    setDragging(true);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer: keep dragging without capture.
    }
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
    setDragging(false);
    const dragged = dragOffset.current;
    dragOffset.current = 0;
    if (panelRef.current) panelRef.current.style.transform = "";
    if (dragged > 90) onClose();
  };

  return (
    <div className={`sheet ${full ? "sheet--full" : ""}`} role="dialog" aria-modal="true">
      <button className="sheet__backdrop" aria-label="Close" onClick={onClose} />
      <div
        className={`sheet__panel ${footer ? "has-footer" : ""} ${
          dragging ? "is-dragging" : ""
        }`}
        ref={panelRef}
      >
        <div
          className="sheet__drag"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div className="sheet__grab-area">
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
        </div>
        <div className="sheet__body">{children}</div>
        {footer ? <div className="sheet__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
