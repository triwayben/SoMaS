import { useCallback, useEffect, useRef, useState } from "react";

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  label: string;
  disabled?: boolean;
  large?: boolean;
  className?: string;
  formatValue?: (value: number) => string;
  /** When set, a tap nudges the value by this much instead of jumping to the tapped spot. */
  tapStep?: number;
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onCommit,
  label,
  disabled = false,
  large = false,
  className = "",
  formatValue,
  tapStep,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [local, setLocal] = useState<number | null>(null);
  const lastSent = useRef(0);
  const pending = useRef<number | null>(null);
  const press = useRef<{ x: number; moved: boolean } | null>(null);
  const nudgeTimer = useRef<number | undefined>(undefined);
  // Transient "+3" / "−3" pill shown where a tap moved the level.
  const [nudge, setNudge] = useState<{ delta: number; percent: number } | null>(null);

  useEffect(() => () => window.clearTimeout(nudgeTimer.current), []);

  const shown = local ?? value;
  const percent = max === min ? 0 : ((shown - min) / (max - min)) * 100;

  const valueFromEvent = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return shown;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      const stepped = Math.round(raw / step) * step;
      return Math.min(max, Math.max(min, Number(stepped.toFixed(4))));
    },
    [max, min, shown, step],
  );

  const emit = useCallback(
    (next: number, force = false) => {
      setLocal(next);
      const time = Date.now();
      if (force || time - lastSent.current > 110) {
        lastSent.current = time;
        pending.current = null;
        onChange(next);
      } else {
        pending.current = next;
      }
    },
    [onChange],
  );

  useEffect(() => {
    if (dragging) return;
    const timer = window.setTimeout(() => setLocal(null), 400);
    return () => window.clearTimeout(timer);
  }, [value, dragging]);

  const finish = useCallback(() => {
    setDragging(false);
    const final = pending.current ?? local;
    pending.current = null;
    if (final != null) {
      onChange(final);
      onCommit?.(final);
      window.setTimeout(() => setLocal(null), 400);
    } else {
      onCommit?.(value);
    }
  }, [local, onChange, onCommit, value]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; dragging still works.
    }
    setDragging(true);
    press.current = { x: event.clientX, moved: tapStep == null };
    // Sliders without a tap step keep their jump-to-position behaviour.
    if (tapStep == null) emit(valueFromEvent(event.clientX), true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled) return;
    const current = press.current;
    if (current && !current.moved) {
      if (Math.abs(event.clientX - current.x) < 4) return;
      current.moved = true;
    }
    emit(valueFromEvent(event.clientX));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = press.current;
    press.current = null;
    if (tapStep != null && current && !current.moved) {
      // A tap nudges the level one increment towards the tapped side.
      const rect = trackRef.current?.getBoundingClientRect();
      const ratio = rect && rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
      const tapped = min + Math.min(1, Math.max(0, ratio)) * (max - min);
      const direction = tapped >= shown ? 1 : -1;
      const next = Math.min(max, Math.max(min, shown + direction * tapStep));
      setDragging(false);
      setLocal(next);
      onChange(next);
      onCommit?.(next);
      window.setTimeout(() => setLocal(null), 400);
      const delta = Math.round(next - shown);
      if (delta !== 0) {
        window.clearTimeout(nudgeTimer.current);
        setNudge({ delta, percent: Math.min(94, Math.max(6, ratio * 100)) });
        nudgeTimer.current = window.setTimeout(() => setNudge(null), 900);
      }
      return;
    }
    finish();
  };

  const handlePointerCancel = () => {
    press.current = null;
    finish();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next = shown;
    const jump = tapStep ?? Math.max(step, Math.round((max - min) / 20 / step) * step);
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = shown + jump;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = shown - jump;
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    else if (event.key === "PageUp") next = shown + jump * 2;
    else if (event.key === "PageDown") next = shown - jump * 2;
    else return;
    event.preventDefault();
    next = Math.min(max, Math.max(min, Math.round(next / step) * step));
    setLocal(next);
    onChange(next);
    onCommit?.(next);
  };

  return (
    <div
      className={`slider ${large ? "slider--large" : ""} ${dragging ? "is-active" : ""} ${
        disabled ? "is-disabled" : ""
      } ${className}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={formatValue ? formatValue(shown) : `${Math.round(shown)}`}
      aria-disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
    >
      {nudge ? (
        <span
          className={`slider__nudge ${nudge.delta > 0 ? "is-up" : "is-down"}`}
          style={{ left: `${nudge.percent}%` }}
          aria-hidden="true"
        >
          {nudge.delta > 0 ? `+${nudge.delta}` : `−${Math.abs(nudge.delta)}`}
        </span>
      ) : null}
      <div className="slider__track" ref={trackRef}>
        <div className="slider__fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
        <div
          className="slider__thumb"
          style={{ left: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}
