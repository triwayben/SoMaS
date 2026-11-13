import { useEffect } from "react";

/**
 * iOS reports a stale dynamic viewport on the first paint of a home-screen app, so `100dvh`
 * starts shorter than the screen and only corrects itself after a scroll. Track the real
 * height in a CSS variable so the shell fills the screen from the start.
 */
export function useViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;

    const apply = () => {
      // Take the largest height the browser reports. An installed app can report a layout
      // viewport short of the screen (leaving a strip below the dock), and the visual
      // viewport shrinks again when the keyboard opens, which must not resize the shell.
      const height = Math.round(
        Math.max(
          window.innerHeight || 0,
          viewport?.height ?? 0,
          document.documentElement.clientHeight || 0,
        ),
      );
      if (height > 0) root.style.setProperty("--app-height", `${height}px`);
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    apply();
    // iOS settles its viewport a moment after first paint, after rotation and after the app
    // is resumed from the home screen.
    const timers = [200, 600, 1200].map((delay) => window.setTimeout(apply, delay));

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("pageshow", schedule);
    viewport?.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", schedule);

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("pageshow", schedule);
      viewport?.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, []);
}
