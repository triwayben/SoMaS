import { useEffect, useState } from "react";
import { readPref, writePref } from "./prefs";

const KEY = "sonos4ma.volumeStep";
const NAME = "volumeStep";
const EVENT = "sonos4ma:volume-step";

export const DEFAULT_VOLUME_STEP = 5;
export const MIN_VOLUME_STEP = 1;
export const MAX_VOLUME_STEP = 10;

export function readVolumeStep(): number {
  const stored = Number(readPref(NAME, KEY));
  if (!Number.isFinite(stored) || stored < MIN_VOLUME_STEP) return DEFAULT_VOLUME_STEP;
  return Math.min(MAX_VOLUME_STEP, Math.round(stored));
}

export function saveVolumeStep(step: number) {
  const next = Math.min(MAX_VOLUME_STEP, Math.max(MIN_VOLUME_STEP, Math.round(step)));
  writePref(NAME, String(next));
  window.dispatchEvent(new Event(EVENT));
}

/** Reads the saved tap step and re-renders when it changes anywhere in the app. */
export function useVolumeStep(): number {
  const [step, setStep] = useState(readVolumeStep);
  useEffect(() => {
    const sync = () => setStep(readVolumeStep());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return step;
}
