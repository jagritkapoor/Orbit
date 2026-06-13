import { useCallback, useEffect, useRef, useState } from "react";
import { onTimerOverlay, type TimerOverlayEvent } from "../tags/timer/timerEvents";
import { timerManager } from "../tags/timer/timerManager";

const MESSAGES: Record<
  TimerOverlayEvent["type"],
  { title: string; subtitle: string; actionLabel: string | null }
> = {
  countdown_done: {
    title: "Done.",
    subtitle: "Your time is up.",
    actionLabel: "Start Again",
  },
  pomo_focus_done: {
    title: "Focus complete.",
    subtitle: "Time for a well-earned break.",
    actionLabel: null,
  },
  pomo_break_done: {
    title: "Break's over.",
    subtitle: "Ready to dive back in?",
    actionLabel: "Start Focus",
  },
};

export function TimerOverlay() {
  const [event, setEvent] = useState<TimerOverlayEvent | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissingRef = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    setDismissing(true);
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setTimeout(() => {
      setEvent(null);
      setDismissing(false);
      dismissingRef.current = false;
    }, 300);
  }, []);

  useEffect(() => {
    return onTimerOverlay((ev) => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      dismissingRef.current = false;
      setDismissing(false);
      setEvent(ev);
      autoTimerRef.current = setTimeout(() => {
        if (ev.type === "countdown_done") timerManager.stop(ev.noteId, ev.sectionIndex);
        dismiss();
      }, 4000);
    });
  }, [dismiss]);

  useEffect(() => {
    if (!event) return;
    const handler = () => {
      if (event.type === "countdown_done") timerManager.stop(event.noteId, event.sectionIndex);
      dismiss();
    };
    window.addEventListener("keydown", handler, { once: true });
    return () => window.removeEventListener("keydown", handler);
  }, [event, dismiss]);

  if (!event) return null;

  const msg = MESSAGES[event.type];

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (event.type === "countdown_done") {
      timerManager.restart(event.noteId, event.sectionIndex);
    } else if (event.type === "pomo_break_done") {
      timerManager.start(event.noteId, event.sectionIndex);
    }
    dismiss();
  };

  return (
    <div
      className={`timer-overlay${dismissing ? " dismissing" : ""}`}
      onClick={() => {
        if (event?.type === "countdown_done") timerManager.stop(event.noteId, event.sectionIndex);
        dismiss();
      }}
    >
      <div className="timer-overlay-content">
        <div className="timer-overlay-dot" />
        <div className="timer-overlay-title">{msg.title}</div>
        <div className="timer-overlay-subtitle">{msg.subtitle}</div>
        {msg.actionLabel && (
          <button className="timer-overlay-action" onClick={handleAction}>
            {msg.actionLabel}
          </button>
        )}
      </div>
      <div className="timer-overlay-hint">click or press any key to dismiss</div>
    </div>
  );
}
