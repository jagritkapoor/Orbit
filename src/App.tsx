import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./App.css";
import { NoteEditor } from "./components/editor/NoteEditor";
import { FullScreenTimerView } from "./components/FullScreenTimerView";
import { TimerOverlay } from "./components/TimerOverlay";
import { UndoToast } from "./components/UndoToast";
import { SearchOverlay } from "./components/SearchOverlay";
import { useNotesStore } from "./store/notesStore";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { initCurrencyRates } from "./tags/math/currency";
import { timerManager } from "./tags/timer/timerManager";
import * as db from "./lib/db";

export default function App() {
  const isLoading = useNotesStore((s) => s.isLoading);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const loadError = useNotesStore((s) => s.loadError);
  const loadNotes = useNotesStore((s) => s.loadNotes);
  const notes = useNotesStore((s) => s.notes);
  const createNote = useNotesStore((s) => s.createNote);
  const createTimerNote = useNotesStore((s) => s.createTimerNote);
  const setActiveNote = useNotesStore((s) => s.setActiveNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const softDeleteNote = useNotesStore((s) => s.softDeleteNote);
  const restoreNote = useNotesStore((s) => s.restoreNote);
  const sortNotes = useNotesStore((s) => s.sortNotes);

  const navDir = useRef<"left" | "right">("right");
  const [shake, setShake] = useState(false);

  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem("orbit-theme") === "dark";
  });

  // Apply class before paint — no flash on load
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);
    getCurrentWindow().setTheme(isDark ? "dark" : "light").catch(() => {});
  }, [isDark]);

  const toggleTheme = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
    localStorage.setItem("orbit-theme", next ? "dark" : "light");
    setIsDark(next);
  };

  const [showSearch, setShowSearch] = useState(false);
  const showSearchRef = useRef(false);
  useEffect(() => { showSearchRef.current = showSearch; });

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const pendingDeleteRef = useRef<string | null>(null);
  useEffect(() => { pendingDeleteRef.current = pendingDelete; });

  const handleUndo = useCallback(async () => {
    const id = pendingDeleteRef.current;
    if (!id) return;
    setPendingDelete(null);
    await restoreNote(id);
  }, [restoreNote]);

  const handleCommit = useCallback(() => {
    const id = pendingDeleteRef.current;
    if (!id) return;
    setPendingDelete(null);
    deleteNote(id);
  }, [deleteNote]);

  const handleTimerStart = useCallback(async (sourceNoteId: string, sectionIndex: number) => {
    const state = timerManager.getState(sourceNoteId, sectionIndex);
    if (!state) return;

    // Create the empty placeholder note first (async), then batch all state updates.
    const newNoteId = await createTimerNote();
    db.setSetting("timer_note_id", newNoteId).catch(console.error);
    db.setSetting("timer_return_to_note_id", sourceNoteId).catch(console.error);

    // These all batch into one render in React 18: overlay appears on note B immediately.
    setActiveTimer({
      noteId: state.noteId,
      sectionIndex: state.sectionIndex,
      type: state.type,
      seconds: state.originalSeconds,
      label: state.label,
    });
    setTimerNoteId(newNoteId);
    setTimerSourceNoteId(sourceNoteId);
    setActiveNote(newNoteId);
  }, [createTimerNote, setActiveNote]);

  const [activeTimer, setActiveTimer] = useState<{
    noteId: string;
    sectionIndex: number;
    type: "countdown" | "pomo";
    seconds: number;
    label?: string;
  } | null>(null);

  // Stable ref so screen-handler callbacks never capture a stale activeNoteId
  const activeNoteIdRef = useRef(activeNoteId);
  useEffect(() => { activeNoteIdRef.current = activeNoteId; });

  // Timer-note state: when a timer is triggered, we create an empty placeholder note
  // (timerNoteId) and remember which note to return to (timerSourceNoteId / note A).
  const [timerNoteId, setTimerNoteId] = useState<string | null>(null);
  const [timerSourceNoteId, setTimerSourceNoteId] = useState<string | null>(null);
  const timerNoteIdRef = useRef<string | null>(null);
  const timerSourceNoteIdRef = useRef<string | null>(null);
  useEffect(() => { timerNoteIdRef.current = timerNoteId; }, [timerNoteId]);
  useEffect(() => { timerSourceNoteIdRef.current = timerSourceNoteId; }, [timerSourceNoteId]);

  // Restore timer-note mapping after an app restart (timer was running when app closed).
  useEffect(() => {
    const restore = async () => {
      const tnId = await db.getSetting("timer_note_id");
      const srcId = await db.getSetting("timer_return_to_note_id");
      if (tnId && srcId) {
        setTimerNoteId(tnId);
        setTimerSourceNoteId(srcId);
      }
    };
    restore().catch(console.error);
  }, []);

  useEffect(() => {
    loadNotes().catch(console.error);
  }, [loadNotes]);

  useEffect(() => {
    initCurrencyRates().catch(console.error);
    timerManager.init().catch(console.error);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) sortNotes();
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, [sortNotes]);

  // Register screen handlers so timerManager can push start/stop events to React
  useEffect(() => {
    timerManager.setScreenHandlers(
      (noteId, sectionIndex) => {
        if (noteId !== activeNoteIdRef.current) return;
        const state = timerManager.getState(noteId, sectionIndex);
        if (!state) return;
        setActiveTimer({
          noteId,
          sectionIndex,
          type: state.type,
          seconds: state.originalSeconds,
          label: state.label,
        });
      },
      (noteId, sectionIndex) => {
        setActiveTimer((prev) =>
          prev?.noteId === noteId && prev?.sectionIndex === sectionIndex
            ? null
            : prev,
        );

        // Clean up the timer placeholder note if one was created for this timer.
        const tnId = timerNoteIdRef.current;
        const returnId = timerSourceNoteIdRef.current;
        if (tnId) {
          const { notes: currentNotes } = useNotesStore.getState();
          const timerNote = currentNotes.find((n) => n.id === tnId);
          // If the user typed anything in the placeholder, treat it as a real note — keep it.
          const isUnmodified = !timerNote || timerNote.content.trim() === "// ⏱";

          if (isUnmodified) {
            // Switch to the original note first (if it still exists and we're on note B)
            // so deleteNote doesn't pick a random next note.
            const returnExists = returnId && currentNotes.some((n) => n.id === returnId);
            if (returnExists && activeNoteIdRef.current === tnId) {
              setActiveNote(returnId!);
            }
            deleteNote(tnId);
          }
          // Always clear the tracking state regardless of whether we deleted the note.
          setTimerNoteId(null);
          setTimerSourceNoteId(null);
          db.setSetting("timer_note_id", "").catch(console.error);
          db.setSetting("timer_return_to_note_id", "").catch(console.error);
        }
      },
    );
    return () => timerManager.setScreenHandlers(null, null);
  }, [deleteNote, setActiveNote]);

  // When switching notes, re-check whether the new note has an active timer.
  // Special case: when landing on the timer placeholder note (note B), look up
  // note A's timer state so the FullScreenTimerView continues to show there.
  useEffect(() => {
    if (!activeNoteId) { setActiveTimer(null); return; }

    if (timerNoteId && activeNoteId === timerNoteId && timerSourceNoteId) {
      const state = timerManager.getStateForNote(timerSourceNoteId);
      if (state) {
        setActiveTimer({
          noteId: state.noteId,
          sectionIndex: state.sectionIndex,
          type: state.type,
          seconds: state.originalSeconds,
          label: state.label,
        });
      }
      return; // always return early while on the timer note
    }

    const state = timerManager.getActiveStateForNote(activeNoteId);
    if (state) {
      setActiveTimer({
        noteId: state.noteId,
        sectionIndex: state.sectionIndex,
        type: state.type,
        seconds: state.originalSeconds,
        label: state.label,
      });
    } else {
      setActiveTimer(null);
    }
  }, [activeNoteId, timerNoteId, timerSourceNoteId]);

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Escape / Cmd+W → hide window (unless search overlay or delete toast is active)
      if (e.key === "Escape" || (mod && e.key === "w")) {
        if (e.key === "Escape" && showSearchRef.current) return;
        if (e.key === "Escape" && pendingDeleteRef.current) {
          e.preventDefault();
          handleCommit();
          return;
        }
        e.preventDefault();
        await getCurrentWindow().hide();
        return;
      }

      // Cmd+Z → undo pending delete (only while toast is visible)
      if (mod && e.key === "z" && pendingDeleteRef.current) {
        e.preventDefault();
        e.stopPropagation();
        handleUndo();
        return;
      }

      // Cmd+Backspace → soft-delete (5-second undo window)
      if (mod && e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        if (!activeNoteId) return;
        // Commit any already-pending delete before starting a new one
        if (pendingDeleteRef.current) {
          deleteNote(pendingDeleteRef.current);
          setPendingDelete(null);
        }
        softDeleteNote(activeNoteId);
        setPendingDelete(activeNoteId);
        return;
      }

      // Cmd+F → open search
      if (mod && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        setShowSearch(true);
        return;
      }

      // Cmd+N → new note (only if current note has content)
      if (mod && e.key === "n") {
        e.preventDefault();
        e.stopPropagation();
        const current = notes.find((n) => n.id === activeNoteId);
        if (!current || current.content.trim() !== "") {
          const id = await createNote();
          setActiveNote(id);
        }
        return;
      }

      // Cmd+[ → older note
      if (mod && e.key === "[") {
        e.preventDefault();
        e.stopPropagation();
        const idx = notes.findIndex((n) => n.id === activeNoteId);
        if (idx < notes.length - 1) {
          navDir.current = "right";
          setActiveNote(notes[idx + 1].id);
        } else {
          setShake(true);
        }
        return;
      }

      // Cmd+] → newer note
      if (mod && e.key === "]") {
        e.preventDefault();
        e.stopPropagation();
        const idx = notes.findIndex((n) => n.id === activeNoteId);
        if (idx > 0) {
          navDir.current = "left";
          setActiveNote(notes[idx - 1].id);
        } else {
          setShake(true);
        }
        return;
      }
    };

    // capture:true so we intercept before CodeMirror handles Cmd+[/]
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [notes, activeNoteId, createNote, setActiveNote, deleteNote, softDeleteNote, handleUndo]);

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-sm">
        <span className="font-bold text-red-400">DB error</span>
        <span className="opacity-60 text-center break-all">{loadError}</span>
      </div>
    );
  }

  if (isLoading || !activeNoteId) {
    return (
      <div className="h-full flex items-center justify-center text-sm opacity-40">
        loading…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        className="title-bar"
        data-tauri-drag-region
      >
        <span className="title-bar-title">Orbit</span>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={isDark ? "Switch to light" : "Switch to dark"}
        >
          {isDark ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
        {navigator.userAgent.includes("Win") && (
          <button
            className="win-close-btn"
            onClick={() => getCurrentWindow().hide()}
            title="Hide"
          >
            ✕
          </button>
        )}
      </div>
      <div
        className={`flex-1 overflow-hidden ${shake ? "shake" : ""}`}
        onAnimationEnd={() => setShake(false)}
      >
        <div key={activeNoteId} className={`h-full slide-from-${navDir.current}`}>
          {activeTimer && (timerNoteId ? timerNoteId === activeNoteId : activeTimer.noteId === activeNoteId) ? (
            <FullScreenTimerView
              noteId={activeTimer.noteId}
              sectionIndex={activeTimer.sectionIndex}
              type={activeTimer.type}
              seconds={activeTimer.seconds}
              label={activeTimer.label}
            />
          ) : (
            <NoteEditor
              noteId={activeNoteId}
              onTimerStart={handleTimerStart}
            />
          )}
        </div>
      </div>
      <TimerOverlay />
      {showSearch && (
        <SearchOverlay
          notes={notes}
          onSelect={(id) => { setActiveNote(id); setShowSearch(false); }}
          onClose={() => setShowSearch(false)}
        />
      )}
      {pendingDelete && (
        <>
          <div className="undo-toast-backdrop" onClick={handleCommit} />
          <UndoToast key={pendingDelete} onUndo={handleUndo} onCommit={handleCommit} />
        </>
      )}
    </div>
  );
}
