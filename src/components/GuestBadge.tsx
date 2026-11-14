import { useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

/**
 * Names the guest view, and explains it when tapped.
 *
 * A guest controls the music but cannot change the library or the server, and nothing on screen
 * said so: a missing heart could be mistaken for a bug. The list below matches what the guest proxy
 * actually allows, so it is an explanation rather than a promise the server will not keep.
 */
const CAN = [
  "Play, pause and skip",
  "Set the volume, and mute",
  "Group rooms together",
  "Browse and search the music library",
  "Add to and reorder the queue",
  "Pick a source and a sound mode",
  "Set a sleep timer",
];

const CANNOT = [
  "Favourite or unfavourite anything",
  "Scan or change the music library",
  "Open the app's own settings",
  "Change Music Assistant's settings or users",
];

export function GuestBadge() {
  const [open, setOpen] = useState(false);

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
          {CAN.map((item) => (
            <div className="panel__row" key={item}>
              <span className="panel__label">{item}</span>
              <span className="guest-allow">
                <Icon name="check" size={16} />
              </span>
            </div>
          ))}
        </div>

        <p className="theme-group__label">What does not</p>
        <div className="panel">
          {CANNOT.map((item) => (
            <div className="panel__row" key={item}>
              <span className="panel__label guest-deny">{item}</span>
            </div>
          ))}
        </div>

        <p className="footnote">
          Ask for a new code if you need more than this; codes can be replaced at any time, which
          ends every guest session at once.
        </p>
      </Sheet>
    </>
  );
}
