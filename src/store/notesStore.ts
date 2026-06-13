import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import * as db from "../lib/db";
import type { Note } from "../types";

interface NotesState {
  notes: Note[];
  activeNoteId: string | null;
  isLoading: boolean;
  loadError: string | null;

  loadNotes: () => Promise<void>;
  setActiveNote: (id: string) => void;
  createNote: () => Promise<string>;
  createTimerNote: () => Promise<string>;
  createWelcomeNote: () => Promise<string>;
  updateContent: (id: string, content: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  softDeleteNote: (id: string) => void;
  restoreNote: (id: string) => Promise<void>;
  sortNotes: () => void;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  activeNoteId: null,
  isLoading: true,
  loadError: null,

  loadNotes: async () => {
    set({ isLoading: true });
    try {
      await db.deleteEmptyNotes();
      const notes = await db.getAllNotes();
      let activeNoteId: string | null = null;

      if (notes.length === 0) {
        const hasSeen = await db.getSetting("has_seen_welcome");
        if (!hasSeen) {
          const id = await get().createWelcomeNote();
          activeNoteId = id;
          await db.setSetting("has_seen_welcome", "1");
        } else {
          const id = await get().createNote();
          activeNoteId = id;
        }
      } else {
        const lastId = await db.getSetting("last_active_note_id");
        const exists = lastId && notes.some((n) => n.id === lastId);
        activeNoteId = exists ? lastId! : notes[0].id;
      }

      set((s) => ({
        notes: s.notes.length === 0 ? notes : s.notes,
        activeNoteId,
        isLoading: false,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("loadNotes failed:", err);
      set({ isLoading: false, loadError: msg });
    }
  },

  setActiveNote: (id) => {
    set({ activeNoteId: id });
    db.setSetting("last_active_note_id", id).catch(console.error);
  },

  createNote: async () => {
    const now = Date.now();
    const note: Note = {
      id: uuidv4(),
      content: "",
      created_at: now,
      updated_at: now,
    };
    await db.createNote(note);
    set((s) => ({ notes: [note, ...s.notes] }));
    return note.id;
  },

  createTimerNote: async () => {
    const now = Date.now();
    // Non-empty content prevents deleteEmptyNotes from removing it on restart.
    const note: Note = {
      id: uuidv4(),
      content: "// ⏱",
      created_at: now,
      updated_at: now,
    };
    await db.createNote(note);
    set((s) => ({ notes: [note, ...s.notes] }));
    return note.id;
  },

  createWelcomeNote: async () => {
    const content = `Welcome to Orbit.

An app built for thoughts before they disappear.

// shortcuts ───────────────────────────────────────

cmd+shift+space  → show / hide orbit from anywhere
cmd+n            → new note
cmd+] / cmd+[    → navigate your notes
cmd+backspace    → delete note
cmd+f            → search in your notes
escape           → hide orbit

// markdown ───────────────────────────────────────
Yes, Orbit supports markdown too.

# heading
## subheading
**bold**
*italic*
~~strikethrough~~

// math ───────────────────────────────────────
Try changing any value — everything updates instantly.

math: unit & currency conversions
distance = 10 km
in_miles = distance to mi
in_feet = distance to ft
price = 100 USD
in_eur = price to EUR
in_gbp = price to GBP

// math: functions ───────────────────────────────────────
// sum, mean, max, min, sqrt, round, log, and more.

math: this week

coffee = 4.50
lunch = 12
snacks = 3.25
total = sum(coffee, lunch, snacks)
avg = mean(coffee, lunch, snacks)

// lists ───────────────────────────────────────
list: things to try
write your first real note (cmd+n)
delete this welcome note (cmd+backspace)
try the fuzzy search (cmd+f)

// timers ───────────────────────────────────────
Start a timer right from your notes which keeps running even when orbit is hidden.

// timer:5 → 5 mins

// timer:1,45 → 1 min 45 sec

// timer:pomo → 25/5 pomodoro

// timer:5 quick focus

// timer:1,45 short break

// timer:pomo deep work

Orbit remembers. So you don't have to.`;

    const now = Date.now();
    const note: Note = { id: uuidv4(), content, created_at: now, updated_at: now };
    await db.createNote(note);
    set((s) => ({ notes: [note, ...s.notes] }));
    return note.id;
  },

  updateContent: async (id, content) => {
    const now = Date.now();
    await db.updateNoteContent(id, content, now);
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, content, updated_at: now } : n
      ),
    }));
  },

  sortNotes: () => {
    set((s) => ({
      notes: [...s.notes].sort((a, b) => b.updated_at - a.updated_at),
    }));
  },

  deleteNote: async (id) => {
    await db.deleteNote(id);
    const remaining = get().notes.filter((n) => n.id !== id);

    if (remaining.length === 0) {
      const newId = await get().createNote();
      set({ activeNoteId: newId });
    } else if (get().activeNoteId === id) {
      const next = remaining[0];
      set({ activeNoteId: next.id });
      db.setSetting("last_active_note_id", next.id).catch(console.error);
    }

    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
  },

  softDeleteNote: (id) => {
    const remaining = get().notes.filter((n) => n.id !== id);

    if (remaining.length === 0) {
      get().createNote();
    } else if (get().activeNoteId === id) {
      const next = remaining[0];
      set({ activeNoteId: next.id });
      db.setSetting("last_active_note_id", next.id).catch(console.error);
    }

    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
  },

  restoreNote: async (id) => {
    const note = await db.getNoteById(id);
    if (!note) return;
    set((s) => {
      const merged = [note, ...s.notes.filter((n) => n.id !== id)];
      merged.sort((a, b) => b.updated_at - a.updated_at);
      return { notes: merged, activeNoteId: id };
    });
    db.setSetting("last_active_note_id", id).catch(console.error);
  },
}));
