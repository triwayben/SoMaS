/**
 * Everything used to be saved under a `sonos4ma.` prefix. The app is SoMaS now, so the old
 * keys are copied to their `somas.` names once on load and then dropped. Without this, the
 * saved server, token and every preference would be stranded under the old prefix and the
 * app would look signed out after the rename.
 */
import { noteSettingsMigrated } from "./migrationNotice";

const LEGACY_PREFIX = "sonos4ma.";
const CURRENT_PREFIX = "somas.";

function migrateLegacyKeys() {
  try {
    // Collect first: removing entries while walking localStorage by index skips keys.
    const legacy: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_PREFIX)) legacy.push(key);
    }
    for (const key of legacy) {
      const value = localStorage.getItem(key);
      const next = CURRENT_PREFIX + key.slice(LEGACY_PREFIX.length);
      // A key already written under the new name wins; the old copy is just cleared away.
      if (value !== null && localStorage.getItem(next) === null) {
        localStorage.setItem(next, value);
      }
      localStorage.removeItem(key);
    }
    if (legacy.length) noteSettingsMigrated();
  } catch {
    // Storage blocked or full (private mode, cookies disabled): there is nothing to move.
  }
}

migrateLegacyKeys();
