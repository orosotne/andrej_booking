"use client";

import { useSyncExternalStore } from "react";

// One ticker for the whole page, however many components read the time.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  timer ??= setInterval(() => listeners.forEach((l) => l()), 15_000);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

// Floored to the minute, so the snapshot stays identical between ticks (as
// useSyncExternalStore requires) and components re-render once a minute.
const getSnapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
// Unknown on the server: callers treat 0 as "no time yet".
const getServerSnapshot = () => 0;

/** The current time in ms, floored to the minute and kept live (≤ 15 s late). */
export function useCurrentMinute(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
