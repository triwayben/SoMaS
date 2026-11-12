export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function formatLongDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const total = Math.round(seconds / 60);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

export function totalDuration(tracks: Array<{ duration?: number | null }>): string {
  const seconds = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
  return formatLongDuration(seconds);
}

export function mediaTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "track":
      return "Song";
    case "album":
      return "Album";
    case "artist":
      return "Artist";
    case "playlist":
      return "Playlist";
    case "radio":
      return "Station";
    case "podcast":
      return "Podcast";
    case "audiobook":
      return "Audiobook";
    case "genre":
      return "Genre";
    case "folder":
      return "Folder";
    default:
      return "Item";
  }
}

export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
