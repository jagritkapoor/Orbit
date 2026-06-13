# Scratchpad App — Build Plan

> **Status:** Active development — phases 0–4 complete  
> **Last updated:** 2026-06-13  
> **Up next:** Remaining feature queue (see bottom of file)

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [Open Questions](#open-questions)
3. [Assumptions](#assumptions)
4. [Tech Stack](#tech-stack)
5. [Architecture](#architecture)
6. [Project Structure](#project-structure)
7. [Data Model](#data-model)
8. [Tag System Design](#tag-system-design)
9. [Per-Tag Specifications](#per-tag-specifications)
10. [Reactive Math Design](#reactive-math-design)
11. [Timer State Machine](#timer-state-machine)
12. [Autocomplete Design](#autocomplete-design)
13. [Navigation Design](#navigation-design)
14. [Keyboard Shortcuts](#keyboard-shortcuts)
15. [Risk Register](#risk-register)
16. [Phased Roadmap](#phased-roadmap)
17. [Definition of Done](#definition-of-done)

---

## Product Overview

A desktop-first scratchpad application. Global keyboard shortcut opens a blank note instantly. Notes are plain text with an optional tag system that adds computation (math, sums, averages), task management (lists), and time tracking (timers) without leaving the editor.

**Design principles:**
- Zero friction to capture. Open → type → close. No modals, no required metadata.
- Tags are opt-in. A note without tags is just a note.
- The editor is the UI. Computation results appear inline inside the editor, not in panels.
- Extensible by design. Adding a new tag requires one file and one registration call.

---

## Open Questions

These must be answered before finalizing Phase 0. Current answers are assumptions (see next section).

| # | Question | Blocks |
|---|----------|--------|
| Q1 | ~~Target platform~~ — **resolved: macOS-first, Windows/Linux deferred** | Tech stack |
| Q2 | ~~Global shortcut~~ — **resolved: `Cmd+Shift+Space`** | Phase 1 |
| Q3 | ~~App lifecycle~~ — **resolved: menubar-only, always running** | Phase 0 |
| Q4 | ~~Math variable scope~~ — **resolved: per section only** | Phase 3 math engine |
| Q5 | ~~Math result display~~ — **resolved: inline, variable-reference rule** | Phase 3 CM6 decorations |
| Q6 | ~~Timer on close~~ — **resolved: resume using wall-clock drift** | Phase 4 |
| Q7 | ~~Multiple `timer:` sections per note~~ — **resolved: yes, supported** | Phase 4 |
| Q8 | ~~Note naming~~ — **resolved: no title field; users label sections via `tagLabel` (e.g. `math: budget june 2026`)** | Phase 1 |
| Q9 | ~~Search~~ — **resolved: fuzzy search included, Phase 5** | Phase 5 |
| Q10 | ~~Sync~~ — **resolved: local only, `~/Library/Application Support/Scratchpad/`** | Storage |
| Q11 | ~~Unit conversions~~ — **resolved: physical units + live currency rates** | Phase 3 |

---

## Assumptions

Defaults used where questions are unanswered. All are changeable unless marked (hard).

| # | Assumption | Default | Changeability |
|---|-----------|---------|---------------|
| A1 | Platform | macOS-first, Windows/Linux deferred | **Confirmed** |
| A2 | Global shortcut | `Cmd+Shift+Space` | **Confirmed** |
| A3 | App lifecycle | Menubar app, always running | **Confirmed** |
| A4 | Math variable scope | Scoped to tag section only | Easy |
| A5 | Math display | Inline, right-aligned, dimmed — **only when RHS references ≥1 variable** | Confirmed |
| A6 | Timer on close | Resume using wall-clock drift | **Confirmed** |
| A7 | Multiple timers | Supported (keyed by section index) | **Confirmed** |
| A20 | Pomo defaults | 25 min focus / 5 min break, stored in `settings` table | **Confirmed** |
| A21 | Pomo customization | Configurable via Preferences panel (Phase 5 UI, Phase 4 data model) | **Confirmed** |
| A8 | Note naming | Date-stamped only | Easy (additive) |
| A9 | Search | Not in MVP | Easy (additive) |
| A10 | Sync | Local only — `~/Library/Application Support/Scratchpad/` | **Confirmed** |
| A11 | Unit conversions | SI + imperial + temperature only | Easy (additive) |
| A12 | Window style | Floating panel, fixed size (~680×520px), top-center of screen | **Confirmed** |
| A13 | Escape key | Hide window to menubar (app keeps running) | **Confirmed** |
| A14 | Window on focus loss | Hide to menubar (same as Escape) | **Confirmed** |
| A15 | Note deletion | `Cmd+Delete` → 5-second undo toast → permanent | **Confirmed** |
| A16 | Editor font | Monospace | **Confirmed** |
| A17 | First launch | Blank note, cursor blinking | **Confirmed** |
| A18 | Tag header style | Accent color + bold + separator rule below | **Confirmed** |
| A19 | Preamble (text before first tag) | Plain text, no computation; `//` comments styled as dimmed | **Confirmed** |
| A22 | Math error display | Red squiggly underline on the faulty line | **Confirmed** |
| A23 | Empty note on navigate-away | Auto-discarded silently | **Confirmed** |
| A24 | Note shown on re-open | Last note the user was editing | **Confirmed** |
| A25 | Sum/avg decimal places | Up to 2dp, trailing zeros stripped | **Confirmed** |
| A26 | Header date | `created_at` (never changes) | **Confirmed** |
| A27 | Tag labels | Optional label after tag arg, shown in header/widget | **Confirmed** |
| A28 | Timer sound | System notification sound only, no custom in-app audio | **Confirmed** |
| A33 | Search UI | Full-screen overlay, `Cmd+F`, fuse.js, results show date + label + snippet | **Confirmed** |
| A34 | Multi-monitor | Window opens on screen where mouse cursor is | **Confirmed** |
| A35 | Font size | Default 14px monospace, configurable 11–20px in Preferences | **Confirmed** |
| A36 | Dark mode | Follows system by default; Auto/Light/Dark override in Preferences | **Confirmed** |
| A29 | All notes deleted | Auto-create a new blank note immediately | **Confirmed** |
| A30 | Text formatting | Plain text only — `//` and tag system are the only special treatments | **Confirmed** |
| A31 | Math variable scope | Scoped to section only — two `math:` sections never share variables | **Confirmed** |
| A32 | Currency conversions | Included — live exchange rates via API, cached locally | **Confirmed** |

---

## Tech Stack

### Tauri 2.0 (Rust shell)

**Why:** ~3-5MB binary vs ~150MB for Electron. Sub-second startup. Rust handles all system-level work: global shortcuts, system notifications, SQLite, window management. Tauri v2.0 is stable (released Oct 2024). Cross-platform if needed later.

**Why not Electron:** Bundle size and startup time are disqualifying for a "opens instantly" tool. Memory usage is 3-5x higher.

**Why not native Swift/SwiftUI:** Locks us to macOS permanently. Rust backend via Tauri is nearly as fast and keeps options open.

### React 18 + TypeScript (frontend)

**Why React:** Largest ecosystem of tutorials, Stack Overflow answers, and UI component libraries. Best choice for someone learning frontend development. TypeScript is mandatory for a complex tag system — it catches errors at compile time that would otherwise appear at runtime.

**Why not Vue or Svelte:** Both are excellent but have smaller help ecosystems and fewer examples for the patterns we need (custom CM6 extensions, Tauri IPC).

### CodeMirror 6 (editor)

**Why:** The single most important dependency. CM6 is built for programmable text editors. Its extension system maps directly to our tag architecture (each tag becomes a CM6 extension). The Decorations API renders widgets inline inside the text — mandatory for math results, checkboxes, and timer displays. Handles undo/redo, selection, and performance for us.

**Why not Monaco:** Designed for IDE-scale use. Too heavy. Overkill.

**Why not TipTap/ProseMirror:** Document-oriented (HTML/JSON nodes). Our model is plain text with inline computation — a code editor model, not a rich document model.

**Why not a `<textarea>`:** Cannot render inline decorations without a proper editor framework.

### mathjs (math evaluation)

Evaluates expressions, manages variables via a `scope` object, supports unit conversions natively (`10 km to miles` works out of the box). Well-maintained, tree-shakable.

### frankfurter.app (currency exchange rates)

Free, no API key required, powered by European Central Bank data. Updated daily. Simple REST endpoint: `GET https://api.frankfurter.app/latest?from=USD`. Supports ~30 major currencies. Rates cached locally in the `settings` table. If this API ever goes away, it is the only file that needs updating.

**Why not a paid API:** No API key = zero setup friction for the user. ECB rates are authoritative and update daily — sufficient for a scratchpad.

### fuse.js (fuzzy search)

Lightweight (~10KB), client-side fuzzy text matching. No server, no index to maintain. Loaded with all note content in memory (fine for thousands of small notes). Used for the `Cmd+F` search panel in Phase 5.

### SQLite via Tauri SQL Plugin

Single `.db` file. ACID transactions. Fast for thousands of notes. Standard location users can back up. Works with iCloud Drive for implicit sync.

### Zustand (state management)

Minimal, ~1KB. Replaces Redux without the boilerplate. Excellent TypeScript support. Easy to learn and debug.

### Tailwind CSS + shadcn/ui

shadcn provides a complete, accessible component system we own outright (no runtime dependency — components are copied into the project). Tailwind is utility-first: faster to iterate for developers learning frontend. Dark mode is built-in.

### Vite

Tauri's default bundler. Fast HMR. No configuration needed.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Tauri 2.0 Shell (Rust)                   │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │   Global    │   │   SQLite     │   │  System          │  │
│  │  Shortcuts  │   │ (rusqlite)   │   │  Notifications   │  │
│  └──────┬──────┘   └──────┬───────┘   └────────┬─────────┘  │
│         └─────────────────┴────────────────────┘            │
│                            │ Tauri IPC (invoke / emit)       │
└────────────────────────────┼─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│                      React Frontend                          │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                     App Shell                         │   │
│  │   (menubar, note navigation, global key handlers)    │   │
│  └───────────────────────┬───────────────────────────────┘   │
│                          │                                    │
│  ┌───────────────────────▼───────────────────────────────┐   │
│  │               NoteEditor (CodeMirror 6)               │   │
│  │                                                       │   │
│  │   ┌──────────────────────────────────────────────┐   │   │
│  │   │                 Tag Engine                   │   │   │
│  │   │                                              │   │   │
│  │   │   NoteParser                                 │   │   │
│  │   │     → splits content into Sections           │   │   │
│  │   │                                              │   │   │
│  │   │   TagRegistry                                │   │   │
│  │   │     ├── MathProcessor    (mathjs)            │   │   │
│  │   │     ├── SumProcessor                        │   │   │
│  │   │     ├── AvgProcessor                        │   │   │
│  │   │     ├── ListProcessor    (list_items DB)     │   │   │
│  │   │     └── TimerProcessor   (state machine)    │   │   │
│  │   │                                              │   │   │
│  │   │   CM6 Extensions (one per tag)               │   │   │
│  │   │     ├── tag syntax highlighting              │   │   │
│  │   │     ├── inline result decorations            │   │   │
│  │   │     └── widget decorations (timer, checkbox) │   │   │
│  │   └──────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌────────────────────┐   ┌──────────────────────────────┐   │
│  │   Notes Store      │   │   Timer Store                │   │
│  │   (Zustand)        │   │   (Zustand + Tauri events)   │   │
│  └────────────────────┘   └──────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Data flow (on every keystroke)

```
User types
  → CM6 transaction fires
  → NoteEditor debounces (150ms) → NoteParser runs
  → NoteParser produces ParsedNote { sections: Section[] }
  → Each Section dispatched to its TagProcessor
  → TagProcessors return TagResult { decorations, widgets, errors }
  → CM6 extensions apply decorations to editor view
  → Auto-save debounces (500ms) → write note.content to SQLite
```

---

## Project Structure

```
scratchpad/
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Entry point, window setup
│   │   ├── commands/
│   │   │   ├── notes.rs          # CRUD commands for notes
│   │   │   ├── timers.rs         # Timer state commands
│   │   │   └── settings.rs       # Settings commands
│   │   ├── shortcuts.rs          # Global shortcut registration
│   │   ├── notifications.rs      # System notification helpers
│   │   └── db/
│   │       ├── mod.rs
│   │       ├── migrations.rs     # SQLite schema migrations
│   │       └── schema.sql        # Source of truth for schema
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                          # React frontend
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # Root component + routing
│   │
│   ├── components/
│   │   ├── editor/
│   │   │   ├── NoteEditor.tsx    # CM6 editor wrapper
│   │   │   ├── extensions/       # CM6 extension modules
│   │   │   │   ├── tagHighlight.ts
│   │   │   │   ├── commentStyle.ts
│   │   │   │   └── autocomplete.ts
│   │   │   └── widgets/          # CM6 inline widget components
│   │   │       ├── MathResultWidget.tsx
│   │   │       ├── CheckboxWidget.tsx
│   │   │       └── TimerWidget.tsx
│   │   │
│   │   ├── tags/                 # Tag system
│   │   │   ├── TagRegistry.ts    # Registry + interface definitions
│   │   │   ├── NoteParser.ts     # Parses raw content → Sections
│   │   │   ├── math/
│   │   │   │   ├── MathProcessor.ts
│   │   │   │   └── mathExtension.ts  # CM6 extension for math tag
│   │   │   ├── sum/
│   │   │   │   ├── SumProcessor.ts
│   │   │   │   └── sumExtension.ts
│   │   │   ├── avg/
│   │   │   │   ├── AvgProcessor.ts
│   │   │   │   └── avgExtension.ts
│   │   │   ├── list/
│   │   │   │   ├── ListProcessor.ts
│   │   │   │   └── listExtension.ts
│   │   │   └── timer/
│   │   │       ├── TimerProcessor.ts
│   │   │       ├── timerMachine.ts   # State machine
│   │   │       └── timerExtension.ts
│   │   │
│   │   ├── navigation/
│   │   │   ├── NoteNav.tsx       # Prev/next buttons
│   │   │   └── NoteList.tsx      # Sidebar note list (Phase 3)
│   │   │
│   │   └── ui/                   # shadcn components (copied in)
│   │
│   ├── store/
│   │   ├── notesStore.ts         # Zustand: note list, active note
│   │   ├── timerStore.ts         # Zustand: timer states per note
│   │   └── settingsStore.ts      # Zustand: app preferences
│   │
│   ├── lib/
│   │   ├── db.ts                 # Tauri SQL plugin wrapper
│   │   ├── shortcuts.ts          # Shortcut definitions (single source)
│   │   ├── ipc.ts                # Tauri invoke/event wrappers
│   │   ├── currency.ts           # Exchange rate fetch, cache, stale-indicator logic
│   │   └── search.ts             # fuse.js wrapper for note fuzzy search
│   │
│   └── types/
│       └── index.ts              # Shared TypeScript types
│
├── BUILD_PLAN.md
├── package.json
└── tsconfig.json
```

---

## Data Model

```sql
-- Core notes
CREATE TABLE notes (
  id          TEXT    PRIMARY KEY,  -- UUID v4
  content     TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,     -- Unix milliseconds
  updated_at  INTEGER NOT NULL      -- Unix milliseconds
);

CREATE INDEX idx_notes_created_at ON notes(created_at DESC);

-- Timer state (persists across restarts)
CREATE TABLE timers (
  id                TEXT    PRIMARY KEY,
  note_id           TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  section_index     INTEGER NOT NULL,    -- which timer: block in the note (0-based)
  timer_type        TEXT    NOT NULL,    -- 'countdown' | 'pomo'
  duration_seconds  INTEGER NOT NULL,
  remaining_seconds INTEGER NOT NULL,
  state             TEXT    NOT NULL DEFAULT 'idle',
                                         -- 'idle' | 'running' | 'paused' | 'focus' | 'break'
  pomo_cycle        INTEGER NOT NULL DEFAULT 0,
  started_at        INTEGER,             -- Unix ms, null when not running
  UNIQUE(note_id, section_index)
);

-- Checkbox state for list: sections
-- Matched by content (not line index) so inserting/deleting lines above
-- a checked item does not reset its state
CREATE TABLE list_items (
  id            TEXT    PRIMARY KEY,
  note_id       TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  section_index INTEGER NOT NULL,
  content       TEXT    NOT NULL,      -- trimmed line text, used for identity matching
  occurrence    INTEGER NOT NULL DEFAULT 0,  -- 0=first instance, 1=second, etc. (handles duplicate lines)
  checked       INTEGER NOT NULL DEFAULT 0,
  UNIQUE(note_id, section_index, content, occurrence)
);

-- App settings (key-value)
-- Pre-populated keys:
--   pomo_focus_minutes  → "25"
--   pomo_break_minutes  → "5"
--   last_active_note_id → UUID of last edited note
--   fx_base_currency    → "USD" (auto-detected from locale on first launch)
--   fx_rates_json       → JSON blob: { "EUR": 0.925, "GBP": 0.792, ... }
--   fx_rates_fetched_at → Unix ms timestamp of last successful fetch
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**Schema notes:**

- `list_items` is separate because checkbox state changes every few seconds and should not trigger full note re-saves.
- `timers` is separate for the same reason — timer state changes every second.
- All timestamps are Unix milliseconds (integers), not ISO strings. Faster to sort, no timezone parsing.
- `ON DELETE CASCADE` ensures timer and list state is cleaned up when a note is deleted.
- `list_items` uses `(content, occurrence)` as the identity key — not line index — so inserting a new line above an existing checked item never shifts or resets it.

### Database file location

**Confirmed: local-only storage.**

```
~/Library/Application Support/Scratchpad/scratchpad.db
```

This is the single source of truth for all notes, timer state, and checkbox state. Time Machine backs it up automatically as part of `~/Library`. Users can also manually copy it to any cloud storage. Deleting the folder removes all notes permanently — worth a warning in the preferences panel.

The path is defined as a single constant in `src/lib/db.ts`. If sync is ever added, only that constant changes.

### Database startup configuration

These pragmas are applied once at startup before any queries:

```sql
PRAGMA journal_mode=WAL;    -- safe for concurrent reads; survives hard shutdown without corruption
PRAGMA foreign_keys=ON;     -- enforces ON DELETE CASCADE
PRAGMA synchronous=NORMAL;  -- good balance between durability and write speed
```

WAL mode is the single most important setting — it means an app crash or hard shutdown cannot corrupt a note mid-write.

### Migration strategy

Schema changes use a numbered migration sequence. Tauri SQL plugin applies them at startup, skipping already-applied migrations:

```
src-tauri/src/db/migrations/
  ├── 001_initial_schema.sql    ← notes, timers, list_items, settings
  ├── 002_add_fts_index.sql     ← future: full-text search
  └── ...
```

**Rule:** Never edit a migration file after it has shipped. Always add a new numbered file. This guarantees existing user databases upgrade correctly without data loss.

---

## Tag System Design

### Core Interface

Every tag implements one interface. The registry knows nothing about what tags do — it only calls them.

```typescript
// types/index.ts

export interface Section {
  tagName: string;          // "math" | "sum" | "list" | "timer" | null
  tagArg: string | null;    // token immediately after colon ("5" in "timer:5", null for "math:")
  tagLabel: string | null;  // optional display label ("deep work" in "timer:25 deep work")
  lines: LineInfo[];        // all lines in this section
  sectionIndex: number;     // position in note (0 = preamble before first tag)
}

export interface LineInfo {
  raw: string;              // original line text
  isComment: boolean;       // true if line starts with //
  lineNumber: number;       // 0-based line number in note
}

export interface TagResult {
  decorations?: DecorationSpec[];   // CM6 decorations to apply
  widgets?: WidgetSpec[];           // inline widgets to render
  errors?: ErrorSpec[];             // per-line error indicators
  sideEffects?: SideEffect[];       // timer state changes, checkbox writes, etc.
}

export interface TagProcessor {
  name: string;
  process(section: Section, noteId: string): TagResult;
  getCompletions?(): Completion[];  // optional autocomplete contributions
}
```

### Tag Registry

```typescript
// tags/TagRegistry.ts

class TagRegistry {
  private processors = new Map<string, TagProcessor>();

  register(processor: TagProcessor): void {
    this.processors.set(processor.name, processor);
  }

  processNote(parsedNote: ParsedNote, noteId: string): NoteResult {
    return parsedNote.sections
      .map(section => {
        const processor = this.processors.get(section.tagName ?? '');
        return processor
          ? processor.process(section, noteId)
          : { decorations: [], widgets: [], errors: [] };
      });
  }

  getAllCompletions(): Completion[] {
    return [...this.processors.values()]
      .flatMap(p => p.getCompletions?.() ?? []);
  }
}

export const registry = new TagRegistry();
```

### Adding a new tag (future: kanban:, habit:, etc.)

```typescript
// tags/kanban/KanbanProcessor.ts
import { registry } from '../TagRegistry';

const kanbanProcessor: TagProcessor = {
  name: 'kanban',
  process(section, noteId) {
    // parse section.lines, return decorations/widgets
  },
  getCompletions() {
    return [{ label: 'kanban:', type: 'keyword' }];
  }
};

registry.register(kanbanProcessor);
```

That is the entire integration. Zero changes to existing files.

### Tag Scope Parsing Rules

A tag declaration line matches the pattern: `^(\w+):([\w]*)(\s+(.*))?$`
- Group 1: `tagName` (e.g. `math`, `timer`, `sum`)
- Group 2: `tagArg` (e.g. `5`, `pomo`, `pause` — empty string for tags with no arg)
- Group 4: `tagLabel` (optional free-text after the arg, trimmed)

```
Input line                   tagName   tagArg   tagLabel
──────────────────────────────────────────────────────────
"math:"                    → "math"    null     null
"math: budget 2026"        → "math"    null     "budget 2026"
"sum:"                     → "sum"     null     null
"sum: groceries"           → "sum"     null     "groceries"
"timer:5"                  → "timer"   "5"      null
"timer:25 deep work"       → "timer"   "25"     "deep work"
"timer:pomo morning"       → "timer"   "pomo"   "morning"
"timer:pause"              → (control command — see Timer spec)
"timer:stop"               → (control command — see Timer spec)
"// anything"              → comment line, isComment=true
"x = 10"                   → content line in current section
""  (blank)                → content line (blank lines are valid)
"unknowntag:"              → not registered → rendered as plain text
EOF                        → end current section
```

**Tag labels in rendering:**
- Tag header line shows the label after the tag name: `sum: groceries` renders as `sum: groceries` in accent color + bold
- Timer widget includes the label in the display: `[▶  25:00  ·  deep work]`
- Labels are purely visual — ignored by all computation

**Unknown tags:** A tag-like line whose name is not registered (e.g. `notarealtag:`) is rendered as plain text. No error shown. This is intentional — the user may be planning ahead for a future tag.

**Important:** Comments (`//`) are passed to processors inside `section.lines` with `isComment: true`. Each processor decides what to do with comments. Sum and avg processors skip them. List processor skips them. Math processor skips them. This keeps the parser simple and gives processors full context.

### Visual Language (confirmed)

**Editor font:** Monospace system font (macOS default: `ui-monospace`, fallback `SFMono-Regular, Menlo`). This makes right-aligned math results column-align correctly.

**Tag declaration line rendering:** Accent color (blue/purple) + bold weight + a thin separator rule rendered as a CM6 line decoration below the tag line. The colon remains visible.

```
math:                          ← accent color, bold
───────────────────────────    ← CM6 line decoration (not in text)
x = 10
result = x + y          30
```

**Preamble (text before the first tag):** Treated as plain text. No computation. `//` lines in the preamble are styled as dimmed/italic (consistent with the rest of the note) but have no computational effect.

**Comment lines (`//`):** Dimmed opacity + italic style everywhere in the note, regardless of which section they're in.

---

## Per-Tag Specifications

Detailed behavioral contract for each `TagProcessor`. These specs define exactly what input each tag accepts, how it computes, and how it renders. Implementation must match these specs precisely.

---

### `math:` Tag

Full computation spec in [Reactive Math Design](#reactive-math-design). Summary here:

- Lines with `identifier = expression` are evaluated top-to-bottom using a shared mathjs scope.
- Inline result shown on the right when RHS contains an arithmetic operator or references a scope variable.
- Plain literal assignments (`x = 10`) are evaluated silently — no result shown, but value enters scope.
- Lines without `=` are plain text.
- Comment lines (`//`) are skipped entirely.
- Variables are scoped to this section only. Two `math:` sections in the same note do not share variables.

---

### `sum:` Tag

**Purpose:** Sum all numeric values in the section, display total below.

**Number extraction rule:** For each non-comment, non-blank line, scan the line for the **last numeric token**. A numeric token is a sequence of digits, optionally including a decimal point (`.`) or thousands comma (`,`). Negative numbers (`-50`) count. If no numeric token is found, the line is visible but contributes 0 to the sum.

**Examples of extraction:**
```
groceries 50       → 50
rent 1,200         → 1200
paid 100 on day 5  → 5   (last number wins)
-30                → -30
coffee run         → 0   (no number — line shown but ignored)
```

**Result display:** A non-editable `Total` decoration rendered by a CM6 widget appears below the last content line of the section, separated by a dim horizontal rule:

```
sum:
groceries     50
rent        1200
// skipped
utilities    150
internet      80
──────────────────
Total       1480
```

**Edge cases:**
- All lines are comments → Total: 0
- Empty section → Total: 0
- Decimal values → summed at full precision, displayed with up to 2 decimal places, trailing zeros stripped (1400.50 → 1400.5, 1480.00 → 1480)

---

### `avg:` Tag

**Purpose:** Average all numeric values in the section, display result below.

**Number extraction:** Same rule as `sum:` — last numeric token per non-comment, non-blank line.

**Denominator:** Count of lines that yielded a numeric contribution (lines with no number are excluded from the denominator, not treated as 0).

**Result display:** A non-editable `Average` decoration below the last content line:

```
avg:
90
85
// disputed score — skip
95
88
──────────────────
Average     89.5
```

**Edge cases:**
- No contributing lines → `Average  —` (em dash, not 0)
- Single contributing line → that value is the average

---

### `list:` Tag

**Purpose:** Turn every line into an interactive checkbox item.

**Line classification:**

| Line type | Rendering |
|-----------|-----------|
| Non-comment, non-blank | `☐ line text` checkbox widget |
| Comment (`//`) | Dimmed plain text, no checkbox |
| Blank | Spacer, no checkbox |

**Checking behavior:** When a box is checked, two decorations are applied to the line:
1. Strikethrough on the text
2. Reduced opacity (e.g. 40%)

**State storage and identity:** Checkbox state is stored in `list_items` keyed by `(note_id, section_index, content, occurrence)` — not by line index. This means:
- Adding a line above a checked item does not reset it.
- Deleting a line removes only that item's record.
- If two lines have identical text, they are disambiguated by occurrence order (0-indexed). Checking the first "Buy milk" only checks the first.

**New lines** start unchecked. Lines whose content matches an existing DB record restore their previous state.

**Example before/after checking:**

```
list:
// this week
Buy milk       →  ☐ Buy milk
Buy eggs       →  ☐ Buy eggs   →  (checked)  ☑ ~~Buy eggs~~ (dimmed)
Buy bread      →  ☐ Buy bread
```

---

### `timer:` Tag

**Purpose:** Create an in-editor countdown or Pomodoro timer with a live visual widget.

**Tag arguments and their initial behavior:**

| Written | Timer type | Initial state |
|---------|-----------|---------------|
| `timer:N` | Countdown, N minutes | Idle, shows N:00 |
| `timer:pomo` | Pomodoro (25/5) | Idle, shows 25:00 |
| `timer:pause` | No new timer; pauses nearest preceding timer | — |
| `timer:stop` | No new timer; stops/resets nearest preceding timer | — |

**Widget rendering:** The `timer:` tag declaration line is visually replaced by a `TimerWidget` component (CM6 `ReplaceDecoration`). The underlying raw text is never changed.

**Widget states:**

```
Idle countdown:               [▶  05:00]
Idle countdown (with label):  [▶  05:00  ·  deep work]
Running countdown:            [▶  03:42]
Paused countdown:             [⏸  03:42]
Expired:                      [✓  Done ]

Pomo idle:                    [▶  25:00  ·  Focus #1]
Pomo idle (with label):       [▶  25:00  ·  morning  ·  Focus #1]
Pomo running:                 [▶  18:43  ·  Focus #1]
Pomo paused:                  [⏸  18:43  ·  Focus #1]
Pomo on break:                [▶  05:00  ·  Break #1]
Pomo next cycle:              [▶  25:00  ·  Focus #2]
```

If `tagLabel` is present, it appears as a middle dot-separated segment in the widget.

**Widget controls:** Clickable icons inside the widget:
- `▶` → start or resume
- `⏸` → pause
- `⏹` → stop and reset to initial time

**Typed control commands:** `timer:pause` and `timer:stop` on a line are recognized as control commands targeting the **nearest preceding `timer:N` or `timer:pomo` section** in the same note. They do not create a new timer section.

```
timer:5        ← widget renders here: [▶ 05:00]
some notes...
timer:pause    ← pauses the timer:5 above → widget updates to [⏸ 05:00]
```

This enables keyboard-only timer control: the user can type `timer:pause` instead of clicking the widget, and `timer:stop` to reset. This mirrors the original spec intent while keeping the data model clean (one timer section, one DB row).

**Notifications:**

| Event | Notification text |
|-------|-------------------|
| Countdown expires | "Timer done" |
| Pomo focus → break | "Focus session complete — take a 5-minute break" |
| Pomo break → focus | "Break over — starting focus session #N" |
| User triggers `timer:stop` | No notification (user-initiated reset) |

**Pomo defaults (configurable):**
- Focus: 25 minutes (stored in `settings` as `pomo_focus_minutes`, default 25)
- Break: 5 minutes (stored in `settings` as `pomo_break_minutes`, default 5)
- Cycles: unlimited (runs until `timer:stop`)
- Phase 5 Preferences panel exposes these as editable fields.

---

## Reactive Math Design

### Evaluation Model (Phase 3)

**Sequential top-to-bottom evaluation** on each parse cycle:

```
Input:                     Scope after each line:
──────────────────────     ────────────────────────
x = 10                 →   { x: 10 }
y = 20                 →   { x: 10, y: 20 }
result = x + y         →   { x: 10, y: 20, result: 30 }
distance = 5 km        →   { ..., distance: 5 km }
miles = distance to mi →   { ..., miles: 3.107 mi }
```

On any edit, the entire section is re-evaluated from line 1. This is reactive because downstream variables always reflect current upstream values. Debounced at 150ms to avoid thrashing on fast typing.

**Error handling:** Each line is evaluated inside a try/catch. On error, the line shows a subtle error indicator (red underline or right-aligned `?`). Evaluation continues on the next line.

**Display rule — confirmed.**

A line shows an inline result when **both** conditions are met:

1. The line is an assignment form: `identifier = expression`
2. The RHS contains **at least one** of:
   - An arithmetic operator (`+`, `-`, `*`, `/`, `^`, `%`)
   - A reference to a variable already in scope

Lines without `=` are always treated as plain text — no evaluation, no result.

| Line | Show result? | Reason |
|------|-------------|--------|
| `x = 10` | **No** | RHS is a plain literal — no operator, no variable ref |
| `y = 20` | **No** | RHS is a plain literal |
| `distance = 5 km` | **No** | RHS is a unit literal — no operator, no variable ref |
| `result = 10 + 20` | **Yes** → `30` | RHS contains arithmetic operator `+` |
| `result = x + y` | **Yes** → `30` | RHS has operator and references `x`, `y` |
| `z = x + 10` | **Yes** → `20` | RHS has operator and references `x` |
| `miles = distance to mi` | **Yes** → `3.107 mi` | RHS references variable `distance` |
| `tax = price * 0.08` | **Yes** | RHS has operator and references `price` |
| `total = revenue` | **Yes** | RHS references variable `revenue` (no operator needed) |
| `x + y` | **No** | No `=` — treated as plain text, not evaluated |
| `10 + 20` | **No** | No `=` — treated as plain text, not evaluated |

All lines with `=` are evaluated and stored in scope regardless of whether a result is displayed. Silent evaluation is what makes downstream variable references work correctly.

**Implementation approach:**

After parsing a line as `lhs = rhs`:
1. Evaluate via `mathjs.evaluate(rhs, scope)` — always.
2. Walk the RHS AST using `mathjs.parse(rhs)` — check for `OperatorNode` or any `SymbolNode` whose name exists in `scope`.
3. If either is found, attach a right-aligned inline decoration with the result.
4. Store `scope[lhs] = result` unconditionally.

mathjs exposes a clean AST (`parse(expr)` returns a node tree with `.type` on each node), so this AST walk is straightforward — no custom parser needed.

Results appear right-aligned, dimmed (Tailwind: `text-muted-foreground`), on the same line as the expression:

```
x = 10
y = 20
distance = 5 km
result = 10 + 20                   30
result = x + y                     30
z = x + 10                         20
miles = distance to mi         3.107 mi
```

### Currency Conversions

mathjs supports physical unit conversions natively. Currency is **not** a native mathjs unit — it is injected as custom units using rates fetched from the API.

**How it works:**

1. On app launch (or if cache is >24h old): fetch `https://api.frankfurter.app/latest?from={base}`, store JSON in `settings.fx_rates_json` and update `settings.fx_rates_fetched_at`.
2. At math evaluation time: read rates from the settings cache. Inject them into mathjs as custom units relative to the base currency (e.g. `EUR = 0.925 USD`).
3. User writes: `price to EUR` — mathjs evaluates the conversion using the injected unit.

**Stale rate indicator:** If `fx_rates_fetched_at` is older than 24h, attach a `⚠ Jun 10` decoration to any line that used a currency conversion. The conversion still shows — it just signals the rate may be outdated.

**Offline:** If no internet and cache exists → use cached rates with stale indicator. If no cache at all (fresh install, never connected) → show `?` on currency conversion lines with a tooltip `"Exchange rates unavailable"`.

**Base currency detection:** On first launch, read `NSLocale.currentLocale.currencyCode` via Tauri (macOS system locale). Store as `settings.fx_base_currency`. If detection fails, default to USD.

**Supported currencies:** Whatever the frankfurter.app API returns (~30 major currencies: USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, etc.).

**Example:**
```
math: travel budget
flights = 800 USD
hotel = 600 EUR
hotel_usd = hotel to USD            648 USD  ⚠ Jun 10
total = flights + hotel_usd        1448 USD  ⚠ Jun 10
```

The `⚠ Jun 10` marker appears only on lines that used a currency conversion with a stale cache.

---

### Dependency Graph (Phase 4 upgrade)

If sequential evaluation proves too slow or incorrect for complex cases, upgrade to a dependency graph: parse assignments to extract which variables each expression reads, topological-sort, evaluate in dependency order. This is a contained upgrade inside `MathProcessor.ts` — nothing else changes.

---

## Timer State Machine

### States

```
IDLE ──────────────────────────────────────────────► RUNNING_FOCUS
       (timer:N | timer:pomo | timer:resume)         (focus countdown active)
         ▲                                                 │
         │ timer:stop                              timer:pause
         │                                               ▼
         │                                          PAUSED
         │                                               │
         │                                         timer:pause (toggle)
         │                                               ▼
         │                                          RUNNING_FOCUS
         │
RUNNING_FOCUS ──── focus expires (pomo) ──────────► RUNNING_BREAK
                                                         │
                                                   break expires (pomo)
                                                         │
                                                         ▼
                                                   RUNNING_FOCUS (pomo_cycle++)
                                                         │
                                                   all cycles done
                                                         ▼
                                                       IDLE + notification
```

### Pomo defaults

- Focus: 25 minutes (`settings.pomo_focus_minutes`, default 25)
- Break: 5 minutes (`settings.pomo_break_minutes`, default 5)
- Cycles: no limit (run until `timer:stop`)
- Values read from `settings` table at timer creation time. Changing the settings affects new timers only, not ones already running.

### Timer persistence

Every 5 seconds while running, write `remaining_seconds` and `state` to SQLite. On app launch:

1. Query all `state = 'running'` timers.
2. Calculate elapsed: `now - started_at`.
3. If `elapsed < remaining_seconds`: resume with corrected `remaining_seconds`.
4. If `elapsed >= remaining_seconds`: expire the timer, send notification.

### Timer in the editor

The `timer:5` or `timer:pomo` tag line is replaced at render time (not in the text) by a `TimerWidget` React component. The underlying raw text is never modified — the widget is a CM6 `ReplaceDecoration`.

**Widget → state machine binding:** Clicking ▶/⏸/⏹ on the widget dispatches Tauri IPC commands that update the `timers` DB table and the `timerStore` Zustand store. The store update triggers a React re-render of the widget.

**Typed commands → state machine binding:** When `NoteParser` encounters `timer:pause` or `timer:stop` on a line that does not start a new timer (i.e., it follows an existing `timer:N` section), it emits a `TimerControlCommand` side effect instead of creating a new `Section`. `TimerProcessor` handles the side effect by updating the appropriate timer's state.

**Why not create a new section for `timer:pause`:** If `timer:pause` created its own section, a note with one timer and one pause command would have two DB rows and two widgets — confusing. The typed-command-as-side-effect model keeps one timer per `timer:N` or `timer:pomo` declaration.

---

## Autocomplete Design

### Visual behavior

CodeMirror 6's built-in `autocompletion` extension renders a popup dropdown below the cursor. It shows a list of candidates with a label and detail string. CM6 handles all rendering, keyboard navigation, and insertion — no custom popup UI needed.

```
User types "m" at line start:
┌───────────────────────────────────────────┐
│ ▶  math:      Math expressions & vars     │  ← highlighted
└───────────────────────────────────────────┘

User types "timer:":
┌───────────────────────────────────────────────────────┐
│ ▶  timer:pomo    25-min focus / 5-min break Pomodoro  │
│    timer:pause   Pause the active timer               │
│    timer:stop    Stop and reset the active timer      │
│    timer:5       5-minute countdown                   │
│    timer:25      25-minute countdown                  │
└───────────────────────────────────────────────────────┘
```

### Trigger conditions

| Where | Trigger | Completions shown |
|-------|---------|-------------------|
| Start of any line (0 or more spaces, then a letter) | Any letter typed | All tag names registered with `TagRegistry` |
| Line already starts with `timer:` | Any character after `:` | Timer sub-commands (`pomo`, `pause`, `stop`, `5`, `25`) |
| Inside a `math:` section, after typing a letter | Any letter typed | Variable names defined earlier in this section |

### Key bindings

| Key | Action |
|-----|--------|
| `Tab` or `Enter` | Accept highlighted completion, insert it |
| `↑` / `↓` | Navigate up/down the candidate list |
| `Escape` | Dismiss popup without inserting |

**Tab collision with indentation:** CM6's `acceptCompletion` keymap is configured so Tab accepts when the popup is open, and inserts two spaces otherwise. The `indentWithTab` extension is disabled — this is a scratchpad, not a code editor.

### How completions stay in sync with new tags

Every `TagProcessor` optionally implements `getCompletions()`. `TagRegistry.getAllCompletions()` collects them all. The `CompletionSource` registered with CM6 calls `registry.getAllCompletions()` on each trigger. Adding a new tag (e.g. `kanban:`) to the registry makes it appear in autocomplete automatically — zero changes to the autocomplete extension.

### Phase rollout

| Phase | What's added |
|-------|-------------|
| 2 | Tag name completions at line start (`math:`, `sum:`, `avg:`, `list:`, `timer:`) |
| 2 | Timer sub-command completions (`timer:pomo`, `timer:pause`, `timer:stop`) |
| 4 | Variable name completions inside `math:` sections |

---

## Window Behavior

**Confirmed: floating panel, fixed size.**

- Size: ~680×520px (width × height)
- Position: top-center of the screen the cursor is on
- Level: floats above all other windows (`alwaysOnTop`)
- Appears on all Spaces
- No dock icon; menubar icon only

**Open/close lifecycle (all confirmed):**
- `Cmd+Shift+Space` (global) → show and focus the window on the screen where the cursor is
- `Escape` (no autocomplete open) → hide to menubar
- Window loses focus (user clicks another app) → hide to menubar instantly
- `Cmd+W` → hide to menubar (do not quit)
- App quit → only via menubar icon → "Quit Scratchpad"

Content is auto-saved before every hide. Reopening is instant — the app never quits.

The app is always running in the background. All note content is auto-saved before the window hides. Reopening is instant.

**Header bar (inside the window):**
```
┌──────────────────────────────────────────┐
│  ← Note 3 of 12 →          Jun 12, 2026 │  ← header bar
│                                          │
│  [editor content here]                   │
│                                          │
└──────────────────────────────────────────┘
```
- Left: prev/next arrows with note counter (`Note 3 of 12`)
- Right: creation date of the active note
- Header is non-editable; clicking anywhere below enters the editor

### Note Deletion

**Confirmed: `Cmd+Delete` with 5-second undo toast.**

1. User presses `Cmd+Delete` on any note
2. Note is removed from the view immediately; navigation moves to adjacent note
3. A toast appears at the bottom of the window: `"Note deleted  [Undo]"` — visible for 5 seconds
4. If Undo is pressed: note is fully restored at its original position
5. After 5 seconds with no Undo: the DB row (and its cascade-deleted timer/list_item rows) is permanently deleted

The note is soft-deleted in memory during the 5-second window and hard-deleted from SQLite after.

---

## Navigation Design

### Model

Notes are ordered by `created_at DESC` (newest first, index 0). The editor shows one note at a time. Navigation moves through this ordered list.

### Methods

| Method | Direction | Phase |
|--------|-----------|-------|
| `Cmd+[` | Older note | 1 |
| `Cmd+]` | Newer note | 1 |
| Trackpad swipe left | Older note | 5 |
| Trackpad swipe right | Newer note | 5 |
| Note list sidebar click | Direct | 3 |

### Swipe detection

Standard `wheel` event listener. macOS reports trackpad horizontal swipes as `wheel` events with dominant `deltaX`. Threshold: `|deltaX| > 50` with `|deltaX| > |deltaY| * 1.5` (to avoid triggering during diagonal scroll). Velocity-based: fast swipe feels snappy.

### Creating a new note

`Cmd+N` creates a new note, sets it as active, resets the editor. The new note is inserted at index 0 of the navigation list.

---

## Keyboard Shortcuts

All shortcuts defined in one file: `src/lib/shortcuts.ts`. Global shortcuts registered in Rust via `tauri-plugin-global-shortcut`. In-app shortcuts handled by a `useKeyboard` React hook that reads from the same config.

| Shortcut | Scope | Action |
|----------|-------|--------|
| `Cmd+Shift+Space` | Global | Show / focus app window |
| `Cmd+N` | In-app | Create new note |
| `Cmd+[` | In-app | Navigate to older note |
| `Cmd+]` | In-app | Navigate to newer note |
| `Cmd+Delete` | In-app | Delete current note (5-second undo) |
| `Tab` | Editor | Accept autocomplete suggestion (if popup open) |
| `Escape` | Editor | Dismiss autocomplete (if open) — otherwise hide window to menubar |
| `Cmd+W` | In-app | Hide window to menubar (same as Escape) |
| `Cmd+F` | In-app | Open fuzzy search overlay (Phase 5) |
| `Cmd+,` | In-app | Open preferences (Phase 5) |

**Design rule:** Shortcuts must not conflict with standard macOS text editing shortcuts. No `Cmd+A` (Select All), `Cmd+Z` (Undo), `Cmd+X/C/V` (Cut/Copy/Paste) — these belong to the editor.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CodeMirror 6 API learning cliff | High | High | Build editor progressively. Start with plain CM6, add extensions one at a time. Keep NoteEditor.tsx small; push complexity into extension files. |
| Inline decoration conflicts with cursor position | Medium | High | Test decoration placement edge cases early (tag at end of file, empty section, single-line section). Use CM6 `StateField` properly. |
| Reactive math performance on large notes | Low | Medium | Debounce evaluation to 150ms. Bail out after 500 lines. Profile before optimizing. |
| Circular variable references (math) | Medium | Medium | Wrap `mathjs.evaluate()` in try/catch. Show error per-line. Never let parser throw into React render. |
| Timer drift on system sleep/wake | Medium | Medium | Use wall-clock diff (`now - started_at`), not tick counting. Test with laptop lid close. |
| Global shortcut permission denied (macOS) | Low | High | Detect failure via Tauri shortcut registration error. Show first-launch dialog guiding user to System Preferences > Accessibility. |
| SQLite corruption on hard shutdown | Low | High | Enable WAL mode (`PRAGMA journal_mode=WAL`). Auto-save is debounced — no mid-write hard kills. |
| Tauri v2 API changes | Low | Low | Pin exact version in `Cargo.toml`. Upgrade only at milestone boundaries. |
| frankfurter.app goes down or rate-limits | Low | Medium | Graceful degradation to cached rates + stale indicator. API is swappable by changing one constant. |
| Currency conversion confuses mathjs custom units | Medium | Medium | Isolate unit injection into a wrapper function. Test all 30 currency pairs. Fail gracefully per-line. |
| fuse.js search slow on 10,000+ notes | Low | Low | Load notes lazily into fuse index. Debounce search input at 100ms. Profile at 1,000 notes before shipping. |

---

## Phased Roadmap

### Phase 0 — Foundation

**Goal:** The app builds, runs, and stores a note.

**Deliverables:**
- [ ] Tauri 2.0 project created with React + TypeScript + Vite
- [ ] Tailwind CSS + shadcn/ui configured
- [ ] SQLite plugin integrated, schema migrated on launch
- [ ] `notesStore` (Zustand) with create/read/update
- [ ] CodeMirror 6 editor renders, accepts input, content syncs to store
- [ ] Auto-save (debounced 500ms) writes to SQLite
- [ ] App launches in development

**Done when:** You can type in the editor and see the note content in the DB via a SQLite browser.

---

### Phase 1 — MVP: Useful Scratchpad

**Goal:** A real scratchpad you would actually use daily.

**Deliverables:**
- [ ] Menubar app (no dock icon, always running)
- [ ] Global shortcut (`Cmd+Shift+Space`) opens/focuses the app window
- [ ] App window shows on all spaces, floats above other windows
- [ ] New note on `Cmd+N`
- [ ] Note navigation: `Cmd+[` / `Cmd+]`
- [ ] Chronological note list (newest note opens by default)
- [ ] `//` comment lines styled differently (dimmed, italic)
- [ ] App packages to `.dmg`

**Done when:** You can open the app with a shortcut, write a note, close it, reopen it, and navigate between notes.

---

### Phase 2 — Tag Foundation

**Goal:** The tag system architecture is in place; simple tags work.

**Deliverables:**
- [ ] `NoteParser.ts` produces `Section[]` from raw note content
- [ ] `TagRegistry.ts` with `TagProcessor` interface
- [ ] Tag declaration lines styled (bold, accent color)
- [ ] `list:` tag: every non-comment line becomes a checkbox
  - [ ] Checkbox state stored in `list_items` table (not in note content)
  - [ ] Checking strikes through text and dims it
- [ ] `sum:` tag: sums all numeric values in section, displays total
- [ ] `avg:` tag: averages all numeric values in section, displays average
- [ ] Comment lines (`//`) excluded from all computations
- [ ] Results displayed as right-aligned inline decorations

**Done when:** A note with `list:` shows functional checkboxes; a note with `sum:` shows a correct total.

---

### Phase 3 — Math Tag

**Goal:** Variables and reactive expressions work.

**Deliverables:**
- [ ] mathjs integrated (tree-shaken import)
- [ ] `MathProcessor.ts` evaluates lines sequentially with shared scope
- [ ] Variable assignment: `x = 10` sets `scope.x = 10`
- [ ] Expression evaluation: `result = x + y` shows `30` inline
- [ ] Unit conversions: `5 km to miles` shows `3.107 mi` inline
- [ ] Re-evaluation on edit (debounced 150ms) — all downstream values update
- [ ] Per-line error indicator for invalid expressions
- [ ] Empty lines and comment lines in math section are skipped

**Done when:** Changing `x = 10` to `x = 50` instantly updates all expressions that reference `x`.

---

### Phase 4 — Timer Tag

**Goal:** Timers work end-to-end including system notifications.

**Deliverables:**
- [ ] `timerMachine.ts` state machine (idle → running → paused → idle)
- [ ] `timer:N` starts an N-minute countdown
- [ ] `timer:pomo` starts a 25/5 Pomodoro cycle
- [ ] `timer:pause` toggles pause/resume
- [ ] `timer:stop` resets timer to idle
- [ ] `TimerWidget` renders inside editor on the timer tag line
- [ ] Timer state persisted to `timers` table (every 5s while running)
- [ ] Timer resumes correctly after app restart
- [ ] System notifications: focus→break, break→focus, countdown expired

**Done when:** A Pomodoro timer runs through a full cycle with notifications; reopening the app shows remaining time correctly.

---

### Phase 5 — Polish: V1 Ready

**Goal:** Ship-quality app.

**Deliverables:**
- [ ] Autocomplete: tag name suggestions at line start
- [ ] Autocomplete: timer sub-commands (`timer:pomo`, `timer:pause`, `timer:stop`)
- [ ] Trackpad swipe navigation (horizontal `wheel` event threshold)
- [ ] Dark/light mode following system preference (Auto/Light/Dark toggle in Preferences)
- [ ] Preferences panel: shortcut config, font size (11–20px), theme (Auto/Light/Dark), pomo durations
- [ ] Fuzzy search (`Cmd+F`): full-screen overlay, fuse.js, results show `[date · tagLabel]` + content snippet, click → navigate, Escape → close
- [ ] Performance: notes with 1000+ lines render without lag
- [ ] Error boundaries on all tag processors (a broken tag never crashes the editor)
- [ ] First-launch accessibility permissions dialog (global shortcut)
- [ ] App auto-updater (Tauri updater plugin)
- [ ] Full test coverage for `NoteParser`, `MathProcessor`, `timerMachine`

**Done when:** The app can be given to someone unfamiliar with it and they can figure it out without explanation.

---

## Definition of Done

A phase is complete when all of these are true:

1. All deliverables in the phase checklist are ticked.
2. The app builds without TypeScript errors (`tsc --noEmit` passes).
3. The golden path for that phase works end-to-end in a real build (not just dev server).
4. No regressions in features from previous phases.
5. The `BUILD_PLAN.md` deliverables checklist is updated.

---

## Key Implementation Order Rules

These rules prevent the most common pitfalls:

1. **Build NoteParser before any tag processor.** Processors depend on correct `Section` objects. A wrong parser breaks everything.

2. **Build the simplest tag first (`sum:`).** It validates the registry + parser + CM6 decoration pipeline with minimal logic. Get this end-to-end before touching math or timers.

3. **Never put business logic in CM6 extensions.** Extensions should only translate `TagResult` objects into decorations. All computation stays in processors.

4. **Never store checkbox state or timer state in `note.content`.** These are separate concerns with separate DB tables. Mixing them causes race conditions between the user typing and the system updating state.

5. **Global shortcut is registered in Rust, not JavaScript.** JavaScript cannot register global shortcuts. This is a Tauri Rust command.

6. **Debounce parse and save separately.** Parse at 150ms (for responsive inline results). Save at 500ms (to avoid excessive DB writes). These are independent timers.

---

## Remaining Feature Queue (as of 2026-06-13)

Phases 0–4 are complete. The following features are agreed and ordered:

### 1. Undo Toast on Note Delete
- `Cmd+Backspace` no longer deletes immediately
- Note is soft-removed from the UI (filtered from the notes array, navigated away from) but NOT deleted from DB yet
- An animated toast slides up from the bottom: "Note deleted" + Undo button + 5-second progress bar draining to zero
- Pressing Undo (or `Cmd+Z`) within 5 seconds restores the note and navigates back to it
- After 5 seconds: actual `db.deleteNote()` is called, toast slides away
- Toast is fully themed (light/dark), matches app design language

### 2. Date Modified Footer + Auto-Sort
- A small dimmed timestamp shown at the bottom of each note ("edited 2 hours ago" style, or absolute date)
- Notes sorted by `updated_at` descending — most recently modified = rightmost (index 0), oldest = leftmost
- `updated_at` written to DB on every auto-save

### 3. Search (`Cmd+F`)
- Full-screen overlay triggered by `Cmd+F`
- Fuzzy search across all note content using fuse.js
- Results show: date, matching snippet with highlighted terms
- Selecting a result navigates to that note and dismisses the overlay
- `Escape` dismisses without navigating

### 4. Markdown Syntax Highlighting (Option 1)
- Install `@codemirror/lang-markdown` and wire it into the CM6 editor
- Syntax highlighting only — markers stay visible, text is styled:
  - `**bold**` → bold weight
  - `*italic*` → italic style
  - `# Heading` → larger, bolder
  - `` `inline code` `` → monospace with subtle background tint
  - `~~strikethrough~~` → strikethrough
- Must not conflict with existing tag system (`list:`, `math:`, `//` comments)
- Option 2 (live preview / hide markers) deferred to a later phase

### 5. Timer Notifications (macOS)
- When a timer finishes and the app window is hidden, fire a macOS system notification
- Notification text: timer label (if set) or generic "Timer done"
- Clicking the notification brings Orbit to front so the user sees the in-app animation

### 6. Greeter / Welcome Note
- On very first launch (checked via `has_seen_welcome` flag in `settings` table), insert a pre-written note
- Covers: `//` comments, `math:`, `list:`, `sum:`, `avg:`, `timer:`, `timer:pomo`
- Covers keyboard shortcuts: `Cmd+N`, `Cmd+Backspace`, `Cmd+[` / `Cmd+]`, `Cmd+F`, `Escape`
- Styled as a real note (not a modal), so the user sees exactly what the app looks like in use

### 7. DMG Packaging
- Configure Tauri bundler for `.dmg` output
- App icon finalised
- Code-signed build (if Apple Developer account available)
- Test install on a clean machine

