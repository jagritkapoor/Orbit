export type TimerOverlayEvent =
  | { type: "countdown_done"; label?: string; noteId: string; sectionIndex: number }
  | { type: "pomo_focus_done"; cycle: number; label?: string; noteId: string; sectionIndex: number }
  | { type: "pomo_break_done"; cycle: number; label?: string; noteId: string; sectionIndex: number };

type Listener = (event: TimerOverlayEvent) => void;

const listeners = new Set<Listener>();

export function onTimerOverlay(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitTimerOverlay(event: TimerOverlayEvent): void {
  listeners.forEach((fn) => fn(event));
}
