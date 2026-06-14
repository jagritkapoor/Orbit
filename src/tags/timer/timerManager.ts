import { v4 as uuidv4 } from "uuid";
import * as db from "../../lib/db";
import { emitTimerOverlay } from "./timerEvents";
import type { TimerRow } from "../../types";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let notifPermission: boolean | null = null;

async function notify(title: string, body?: string): Promise<void> {
  if (notifPermission === null) {
    notifPermission = await isPermissionGranted();
    if (!notifPermission) {
      const result = await requestPermission();
      notifPermission = result === "granted";
    }
  }
  if (notifPermission) {
    sendNotification({ title, body });
  }
}

const CIRCUMFERENCE = 238.761; // 2π × 38
const POMO_FOCUS_DEFAULT = 25;
const POMO_BREAK_DEFAULT = 5;
const PERSIST_INTERVAL_MS = 5000;

export type TimerStatus = "idle" | "running" | "paused" | "cycle_done" | "done";
export type TimerPhase = "focus" | "break";

export interface TimerState {
  id: string;
  noteId: string;
  sectionIndex: number;
  type: "countdown" | "pomo";
  originalSeconds: number;
  phaseDurationSeconds: number;
  remainingSeconds: number;
  status: TimerStatus;
  phase: TimerPhase;
  pomoCycle: number;
  startedAt: number | null;
  label?: string;
}

export interface WidgetRefs {
  container: HTMLElement;
  timeEl: HTMLElement;
  fillEl: SVGCircleElement;
  playBtn: HTMLElement;
  phaseEl: HTMLElement | null;
  totalSeconds: number;
}

type ScreenHandler = (noteId: string, sectionIndex: number) => void;

const states = new Map<string, TimerState>();
const freshTimers = new Set<string>(); // keys whose first buildDecorations call should auto-enter full-screen
const pendingFullScreen = new Set<string>(); // full-screen requested; NoteEditor not yet unmounted
const doneTimeouts = new Map<string, ReturnType<typeof setTimeout>>(); // 3s done→idle resets
const widgetRefs = new Map<string, WidgetRefs>();
let tickIntervalId: ReturnType<typeof setInterval> | null = null;
let lastPersistAt = 0;
let pomoFocusMinutes = POMO_FOCUS_DEFAULT;
let pomoBreakMinutes = POMO_BREAK_DEFAULT;
let onTimerActivated: ScreenHandler | null = null;
let onTimerDeactivated: ScreenHandler | null = null;

function makeKey(noteId: string, sectionIndex: number): string {
  return `${noteId}:${sectionIndex}`;
}

function anyRunning(): boolean {
  for (const s of states.values()) {
    if (s.status === "running") return true;
  }
  return false;
}

function formatTime(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function getCurrentRemaining(state: TimerState): number {
  if (state.status === "running" && state.startedAt !== null) {
    const elapsed = (Date.now() - state.startedAt) / 1000;
    return Math.max(0, state.phaseDurationSeconds - elapsed);
  }
  return state.remainingSeconds;
}

function updateWidgetDOM(key: string, state: TimerState, remaining: number) {
  const refs = widgetRefs.get(key);
  if (!refs) return;

  const { container, timeEl, fillEl, playBtn, phaseEl } = refs;

  timeEl.textContent = formatTime(remaining);

  const fraction = refs.totalSeconds > 0 ? remaining / refs.totalSeconds : 1;
  const offset = CIRCUMFERENCE * (1 - fraction);
  fillEl.style.strokeDashoffset = String(Math.max(0, offset));

  const ds =
    state.status === "running" ? "running"
    : state.status === "paused" ? "paused"
    : state.status === "done" ? "done"
    : "idle";
  container.setAttribute("data-state", ds);

  const isBreak = state.type === "pomo" && state.phase === "break";
  const isDone = state.status === "done";
  if (isDone || isBreak) {
    fillEl.style.stroke = "#52c97c";
    fillEl.style.filter = `drop-shadow(0 0 ${isDone ? "7" : "4"}px rgba(82,201,124,${isDone ? "0.95" : "0.7"}))`;
  } else {
    fillEl.style.stroke = "";
    fillEl.style.filter = "";
  }

  playBtn.textContent = state.status === "running" ? "⏸" : "▶";

  if (phaseEl) {
    if (state.type === "pomo") {
      const name = state.phase === "break" ? "Break" : "Focus";
      phaseEl.textContent = `${name} #${state.pomoCycle}`;
      phaseEl.style.display = "";
    } else {
      phaseEl.style.display = "none";
    }
  }
}

async function persistTimer(state: TimerState): Promise<void> {
  let dbState: string = state.status;
  if (state.status === "cycle_done" || state.status === "done") dbState = "idle";

  const row: TimerRow = {
    id: state.id,
    note_id: state.noteId,
    section_index: state.sectionIndex,
    timer_type: state.type,
    duration_seconds: Math.ceil(state.phaseDurationSeconds),
    remaining_seconds: Math.ceil(state.remainingSeconds),
    state: dbState as TimerRow["state"],
    pomo_cycle: state.pomoCycle,
    started_at: state.startedAt,
    phase: state.phase,
  };
  await db.upsertTimer(row);
}

function handleExpiry(key: string, state: TimerState) {
  if (state.type === "countdown") {
    state.status = "done";
    state.remainingSeconds = 0;
    state.startedAt = null;
    updateWidgetDOM(key, state, 0);
    emitTimerOverlay({ type: "countdown_done", label: state.label, noteId: state.noteId, sectionIndex: state.sectionIndex });
    notify(state.label ? `"${state.label}" done` : "Time's up ⏱").catch(console.error);
    persistTimer(state).catch(console.error);

    const tid = setTimeout(() => {
      doneTimeouts.delete(key);
      const s = states.get(key);
      if (s && s.status === "done") {
        s.status = "idle";
        s.phase = "focus";
        s.remainingSeconds = s.originalSeconds;
        s.phaseDurationSeconds = s.remainingSeconds;
        const refs = widgetRefs.get(key);
        if (refs) refs.totalSeconds = s.remainingSeconds;
        updateWidgetDOM(key, s, s.remainingSeconds);
        persistTimer(s).catch(console.error);
        if (!anyRunning()) stopTick();
        onTimerDeactivated?.(s.noteId, s.sectionIndex);
      }
    }, 5000);
    doneTimeouts.set(key, tid);
  } else {
    if (state.phase === "focus") {
      // Auto-start break
      state.phase = "break";
      state.phaseDurationSeconds = pomoBreakMinutes * 60;
      state.remainingSeconds = state.phaseDurationSeconds;
      state.startedAt = Date.now();
      const refs = widgetRefs.get(key);
      if (refs) refs.totalSeconds = state.phaseDurationSeconds;
      updateWidgetDOM(key, state, state.remainingSeconds);
      emitTimerOverlay({ type: "pomo_focus_done", cycle: state.pomoCycle, label: state.label, noteId: state.noteId, sectionIndex: state.sectionIndex });
      notify("Focus session complete 🎯", state.label ? `"${state.label}" — time for a break` : "Step away for 5 minutes").catch(console.error);
      persistTimer(state).catch(console.error);
    } else {
      // Break done → wait for user to start next cycle
      state.status = "cycle_done";
      state.phase = "focus";
      state.pomoCycle += 1;
      state.remainingSeconds = pomoFocusMinutes * 60;
      state.phaseDurationSeconds = state.remainingSeconds;
      state.startedAt = null;
      const refs = widgetRefs.get(key);
      if (refs) refs.totalSeconds = state.phaseDurationSeconds;
      updateWidgetDOM(key, state, state.remainingSeconds);
      emitTimerOverlay({ type: "pomo_break_done", cycle: state.pomoCycle - 1, label: state.label, noteId: state.noteId, sectionIndex: state.sectionIndex });
      notify("Break over 💪", `Focus session #${state.pomoCycle} — let's go`).catch(console.error);
      persistTimer(state).catch(console.error);
      if (!anyRunning()) stopTick();
    }
  }
}

function tick() {
  for (const [key, state] of states) {
    if (state.status !== "running") continue;
    const remaining = getCurrentRemaining(state);
    state.remainingSeconds = remaining;
    updateWidgetDOM(key, state, remaining);
    if (remaining <= 0) handleExpiry(key, state);
  }

  const now = Date.now();
  if (now - lastPersistAt > PERSIST_INTERVAL_MS) {
    lastPersistAt = now;
    for (const s of states.values()) {
      if (s.status === "running") persistTimer(s).catch(console.error);
    }
  }
}

function startTick() {
  if (tickIntervalId !== null) return;
  tickIntervalId = setInterval(tick, 1000);
}

function stopTick() {
  if (tickIntervalId === null) return;
  clearInterval(tickIntervalId);
  tickIntervalId = null;
}

export const timerManager = {
  async init(): Promise<void> {
    try {
      const focusStr = await db.getSetting("pomo_work_minutes");
      const breakStr = await db.getSetting("pomo_break_minutes");
      if (focusStr) pomoFocusMinutes = parseInt(focusStr, 10) || POMO_FOCUS_DEFAULT;
      if (breakStr) pomoBreakMinutes = parseInt(breakStr, 10) || POMO_BREAK_DEFAULT;
    } catch { /* use defaults */ }

    try {
      const rows = await db.getAllTimers();
      const now = Date.now();

      for (const row of rows) {
        const key = makeKey(row.note_id, row.section_index);
        let status: TimerStatus = "idle";
        let remaining = row.remaining_seconds;
        let phaseDuration = row.duration_seconds;
        const phase: TimerPhase = (row.phase ?? "focus") as TimerPhase;

        if (row.state === "running" && row.started_at !== null) {
          const elapsed = (now - row.started_at) / 1000;
          remaining = Math.max(0, row.remaining_seconds - elapsed);
          if (remaining <= 0) {
            status = "idle";
            remaining = row.timer_type === "countdown"
              ? row.duration_seconds
              : pomoFocusMinutes * 60;
            phaseDuration = remaining;
          } else {
            status = "paused";
            phaseDuration = remaining;
          }
        } else if (row.state === "paused") {
          status = "paused";
        }

        // For pomo, store the default focus-minutes sentinel (not actual seconds)
        // so ensureState comparisons stay stable across settings changes.
        const originalSeconds = row.timer_type === "countdown"
          ? row.duration_seconds
          : pomoFocusMinutes;

        states.set(key, {
          id: row.id,
          noteId: row.note_id,
          sectionIndex: row.section_index,
          type: row.timer_type,
          originalSeconds,
          phaseDurationSeconds: phaseDuration,
          remainingSeconds: remaining,
          status,
          phase,
          pomoCycle: Math.max(1, row.pomo_cycle),
          startedAt: null,
        });
      }
      // Notify App of any timers that need the full-screen view after recovery
      for (const state of states.values()) {
        if (
          state.status === "running" ||
          state.status === "paused" ||
          state.status === "cycle_done"
        ) {
          onTimerActivated?.(state.noteId, state.sectionIndex);
        }
      }
    } catch (e) {
      console.error("[timerManager] init error:", e);
    }
  },

  ensureState(
    noteId: string,
    sectionIndex: number,
    type: "countdown" | "pomo",
    seconds: number,
    label?: string,
  ): TimerState {
    const key = makeKey(noteId, sectionIndex);
    const existing = states.get(key);
    if (existing) {
      existing.label = label;
      if (
        existing.status === "idle" &&
        (existing.type !== type || existing.originalSeconds !== seconds)
      ) {
        existing.type = type;
        existing.originalSeconds = seconds;
        const initial = type === "pomo" ? pomoFocusMinutes * 60 : seconds;
        existing.phaseDurationSeconds = initial;
        existing.remainingSeconds = initial;
        existing.pomoCycle = 1;
        existing.phase = "focus";
        const refs = widgetRefs.get(key);
        if (refs) refs.totalSeconds = initial;
        freshTimers.add(key); // re-mark fresh so the spec-change auto-enters full-screen
      } else if (
        existing.status !== "idle" &&
        (existing.type !== type || existing.originalSeconds !== seconds)
      ) {
        existing.originalSeconds = seconds;
        existing.type = type;
      }
      return existing;
    }
    const initial = type === "pomo" ? pomoFocusMinutes * 60 : seconds;
    const s: TimerState = {
      id: uuidv4(),
      noteId,
      sectionIndex,
      type,
      originalSeconds: seconds,
      phaseDurationSeconds: initial,
      remainingSeconds: initial,
      status: "idle",
      phase: "focus",
      pomoCycle: 1,
      startedAt: null,
      label,
    };
    states.set(key, s);
    freshTimers.add(key);
    return s;
  },

  getState(noteId: string, sectionIndex: number): TimerState | undefined {
    return states.get(makeKey(noteId, sectionIndex));
  },

  start(noteId: string, sectionIndex: number): void {
    const key = makeKey(noteId, sectionIndex);
    const state = states.get(key);
    if (!state || state.status === "running") return;

    // Pause any other running timer in this note
    for (const [k, s] of states) {
      if (s.noteId === noteId && k !== key && s.status === "running") {
        timerManager.pause(s.noteId, s.sectionIndex);
      }
    }

    if (state.status === "idle") {
      const total = state.type === "pomo" ? pomoFocusMinutes * 60 : state.originalSeconds;
      state.remainingSeconds = total;
      state.phaseDurationSeconds = total;
      state.pomoCycle = 1;
      state.phase = "focus";
      const refs = widgetRefs.get(key);
      if (refs) refs.totalSeconds = total;
    } else if (state.status === "cycle_done") {
      const total = pomoFocusMinutes * 60;
      state.remainingSeconds = total;
      state.phaseDurationSeconds = total;
      state.phase = "focus";
      const refs = widgetRefs.get(key);
      if (refs) refs.totalSeconds = total;
    }
    // paused: keep remaining + phase as-is

    state.phaseDurationSeconds = state.remainingSeconds;
    state.startedAt = Date.now();
    state.status = "running";

    updateWidgetDOM(key, state, state.remainingSeconds);
    startTick();
    persistTimer(state).catch(console.error);
    onTimerActivated?.(noteId, sectionIndex);
  },

  pause(noteId: string, sectionIndex: number): void {
    const key = makeKey(noteId, sectionIndex);
    const state = states.get(key);
    if (!state || state.status !== "running") return;

    state.remainingSeconds = getCurrentRemaining(state);
    state.phaseDurationSeconds = state.remainingSeconds;
    state.startedAt = null;
    state.status = "paused";

    updateWidgetDOM(key, state, state.remainingSeconds);
    if (!anyRunning()) stopTick();
    persistTimer(state).catch(console.error);
  },

  stop(noteId: string, sectionIndex: number): void {
    const key = makeKey(noteId, sectionIndex);
    const state = states.get(key);
    if (!state) return;

    const total = state.type === "pomo" ? pomoFocusMinutes * 60 : state.originalSeconds;
    state.status = "idle";
    state.phase = "focus";
    state.remainingSeconds = total;
    state.phaseDurationSeconds = total;
    state.pomoCycle = 1;
    state.startedAt = null;

    const refs = widgetRefs.get(key);
    if (refs) refs.totalSeconds = total;

    updateWidgetDOM(key, state, total);
    if (!anyRunning()) stopTick();
    persistTimer(state).catch(console.error);
    onTimerDeactivated?.(noteId, sectionIndex);
  },

  restart(noteId: string, sectionIndex: number): void {
    const key = makeKey(noteId, sectionIndex);

    // Cancel the 3-second done→idle timeout so it doesn't clobber the restart
    const tid = doneTimeouts.get(key);
    if (tid !== undefined) {
      clearTimeout(tid);
      doneTimeouts.delete(key);
    }

    const state = states.get(key);
    if (!state) return;

    // Reset to clean idle so start() picks up the full duration
    const total = state.type === "pomo" ? pomoFocusMinutes * 60 : state.originalSeconds;
    state.status = "idle";
    state.phase = "focus";
    state.pomoCycle = 1;
    state.remainingSeconds = total;
    state.phaseDurationSeconds = total;
    state.startedAt = null;
    const refs = widgetRefs.get(key);
    if (refs) refs.totalSeconds = total;

    timerManager.start(noteId, sectionIndex);
  },

  pauseNearest(noteId: string, beforeSectionIndex: number): void {
    let nearest: TimerState | null = null;
    for (const [, s] of states) {
      if (s.noteId !== noteId || s.sectionIndex >= beforeSectionIndex) continue;
      if (s.status !== "running") continue;
      if (!nearest || s.sectionIndex > nearest.sectionIndex) nearest = s;
    }
    if (nearest) timerManager.pause(nearest.noteId, nearest.sectionIndex);
  },

  stopNearest(noteId: string, beforeSectionIndex: number): void {
    let nearest: TimerState | null = null;
    for (const [, s] of states) {
      if (s.noteId !== noteId || s.sectionIndex >= beforeSectionIndex) continue;
      if (!nearest || s.sectionIndex > nearest.sectionIndex) nearest = s;
    }
    if (nearest) timerManager.stop(nearest.noteId, nearest.sectionIndex);
  },

  registerWidget(key: string, refs: WidgetRefs): void {
    widgetRefs.set(key, refs);
  },

  unregisterWidget(key: string): void {
    widgetRefs.delete(key);
  },

  refreshWidget(noteId: string, sectionIndex: number): void {
    const key = makeKey(noteId, sectionIndex);
    const state = states.get(key);
    if (!state) return;
    updateWidgetDOM(key, state, getCurrentRemaining(state));
  },

  markFresh(noteId: string, sectionIndex: number): void {
    freshTimers.add(makeKey(noteId, sectionIndex));
  },

  // Removes the fresh mark without triggering the overlay — used when the new-note
  // flow handles showing the overlay directly, so buildDecorations doesn't also try.
  clearFresh(noteId: string, sectionIndex: number): void {
    freshTimers.delete(makeKey(noteId, sectionIndex));
  },

  // Returns the first timer state for a note regardless of running/idle status.
  // Used to populate activeTimer on the timer placeholder note (note B) even
  // before the user has pressed play.
  getStateForNote(noteId: string): TimerState | undefined {
    for (const state of states.values()) {
      if (state.noteId === noteId) return state;
    }
    return undefined;
  },

  // Called from buildDecorations (before any CM6 widget DOM is created).
  // Returns true when this section should auto-enter full-screen — caller must return
  // an invisible line decoration instead of the block widget.
  claimFresh(noteId: string, sectionIndex: number): boolean {
    const key = makeKey(noteId, sectionIndex);
    if (!freshTimers.has(key) && !pendingFullScreen.has(key)) return false;
    freshTimers.delete(key);
    pendingFullScreen.add(key);
    onTimerActivated?.(noteId, sectionIndex);
    return true;
  },

  // Called by FullScreenTimerView on mount to confirm the hand-off is done.
  clearPending(noteId: string, sectionIndex: number): void {
    pendingFullScreen.delete(makeKey(noteId, sectionIndex));
  },

  setScreenHandlers(
    activated: ScreenHandler | null,
    deactivated: ScreenHandler | null,
  ): void {
    onTimerActivated = activated;
    onTimerDeactivated = deactivated;
  },

  getRemainingSeconds(noteId: string, sectionIndex: number): number {
    const state = states.get(makeKey(noteId, sectionIndex));
    if (!state) return 0;
    return getCurrentRemaining(state);
  },

  getActiveStateForNote(noteId: string): TimerState | undefined {
    for (const state of states.values()) {
      if (
        state.noteId === noteId &&
        (state.status === "running" ||
          state.status === "paused" ||
          state.status === "cycle_done")
      ) {
        return state;
      }
    }
    return undefined;
  },
};
