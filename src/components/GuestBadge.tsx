import { useEffect, useState } from "react";
import {
  GUEST_ALWAYS,
  GUEST_FORBIDDEN,
  GUEST_OPTIONAL,
  isAllowed,
  loadGuestLimits,
  type GuestLimits,
} from "../lib/guestLimits";
import { useApp } from "../store";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

/**
 * Names the guest view, and explains it when tapped.
 *
 * Both lists come from the same file the proxy enforces, and which optional powers are switched on
 * is read from the proxy itself, so a guest is never told they can do something the server will
 * refuse a moment later.
 */
export function GuestBadge() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [limits, setLimits] = useState<GuestLimits | null>(null);

  // Asked when the sheet opens: a guest changes nothing, so their copy is never the authority.
  useEffect(() => {
    if (!open || app.backendKind !== "mas") return;
    let cancelled = false;
    void loadGuestLimits(app.baseUrl).then((next) => {
      if (!cancelled && next) setLimits(next);
    });
    return () => {
      cancelled = true;
    };
  }, [open, app.baseUrl, app.backendKind]);

  const allowed = GUEST_OPTIONAL.filter((feature) => isAllowed(limits, feature.id));
  const withheld = GUEST_OPTIONAL.filter((feature) => !isAllowed(limits, feature.id));

  return (
    <>
      <button
        type="button"
        className="pill pill--guest"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="You are signed in as a guest — see what that allows"
        title="Signed in with a guest code"
      >
        Guest
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Guest access"
        subtitle="This phone was let in with a guest code"
      >
        <p className="sheet__hint">
          Rooms and music are yours to control. A few things belong to the person whose house this
          is, so they are deliberately out of reach.
        </p>

        <p className="theme-group__label">What works</p>
        <div className="panel">
          {[...GUEST_ALWAYS, ...allowed.map((feature) => feature.label)].map((label) => (
            <div className="panel__row" key={label}>
              <span className="panel__label">{label}</span>
              <span className="guest-allow">
                <Icon name="check" size={16} />
              </span>
            </div>
          ))}
        </div>

        <p className="theme-group__label">What does not</p>
        <div className="panel">
          {[...withheld.map((feature) => feature.label), ...GUEST_FORBIDDEN].map((label) => (
            <div className="panel__row" key={label}>
              <span className="panel__label guest-deny">{label}</span>
            </div>
          ))}
        </div>

        <p className="footnote">
          The person whose house this is decides which of these are on, and can replace the code at
          any time, which ends every guest session at once.
        </p>
      </Sheet>
    </>
  );
}
