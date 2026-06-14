import { useEffect, useReducer } from "react";
import { timerManager } from "../tags/timer/timerManager";

const FS_R = 88;
const FS_CIRC = 2 * Math.PI * FS_R; // ≈ 552.92

interface Props {
  noteId: string;
  sectionIndex: number;
  type: "countdown" | "pomo";
  seconds: number;
  label?: string;
}

function fmt(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function FullScreenTimerView({
  noteId,
  sectionIndex,
  type,
  seconds,
  label,
}: Props) {
  const [, dispatch] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    timerManager.clearPending(noteId, sectionIndex);
    const s = timerManager.getState(noteId, sectionIndex);
    if (s && s.status === "idle") {
      timerManager.start(noteId, sectionIndex);
    }
  }, [noteId, sectionIndex]);

  useEffect(() => {
    const id = setInterval(dispatch, 250);
    return () => clearInterval(id);
  }, [dispatch]);

  const state =
    timerManager.getState(noteId, sectionIndex) ??
    timerManager.ensureState(noteId, sectionIndex, type, seconds, label);

  const remaining = timerManager.getRemainingSeconds(noteId, sectionIndex);
  const total = state.phaseDurationSeconds;
  const fraction = total > 0 ? remaining / total : 1;
  const offset = FS_CIRC * (1 - fraction);

  const isRunning = state.status === "running";
  const isBreak = state.type === "pomo" && state.phase === "break";
  const isDone = state.status === "done";
  const isGreen = isBreak || isDone;

  return (
    <div
      className="fs-timer-view"
      data-state={state.status}
      data-running={isRunning ? "true" : undefined}
    >
      {label && <div className="fs-timer-label">{label}</div>}

      <div className="fs-timer-ring-wrap">
        <svg
          className="fs-timer-svg"
          width="200"
          height="200"
          viewBox="0 0 200 200"
        >
          <circle className="fs-ring-track" cx="100" cy="100" r={FS_R} />
          <circle
            className={[
              "fs-ring-fill",
              isGreen ? "fs-ring-fill--green" : "",
              state.status === "paused" ? "fs-ring-fill--paused" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            cx="100"
            cy="100"
            r={FS_R}
            style={{
              strokeDasharray: FS_CIRC,
              strokeDashoffset: Math.max(0, offset),
            }}
          />
        </svg>

        <div className="fs-timer-center">
          {!isDone && <div className="fs-timer-time">{fmt(remaining)}</div>}
          {state.type === "pomo" && (
            <div className="fs-timer-phase">
              {state.phase === "break" ? "Break" : "Focus"} #{state.pomoCycle}
            </div>
          )}
        </div>
      </div>

      <div className="fs-timer-controls">
        <button
          className="fs-timer-btn"
          onClick={() =>
            isRunning
              ? timerManager.pause(noteId, sectionIndex)
              : timerManager.start(noteId, sectionIndex)
          }
        >
          {isRunning ? "⏸" : "▶"}
        </button>
        <button
          className="fs-timer-btn"
          onClick={() => timerManager.stop(noteId, sectionIndex)}
        >
          ■
        </button>
      </div>

      <div className="fs-timer-nav-hint">cmd+[ · cmd+] · cmd+n</div>
    </div>
  );
}
