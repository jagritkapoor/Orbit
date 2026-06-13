import { useEffect, useRef, useCallback } from "react";
import { RangeSetBuilder, StateField, StateEffect, EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  gutter,
  GutterMarker,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  WidgetType,
  drawSelection,
  type DecorationSet,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { useNotesStore } from "../../store/notesStore";
import { parseNote } from "../../lib/NoteParser";
import { registry, listProcessor } from "../../tags/index";
import { makeListItemKey } from "../../tags/list/ListProcessor";
import { addRatesUpdateListener } from "../../tags/math/currency";
import { timerManager } from "../../tags/timer/timerManager";
import { parseTimerArg, resolveTimerArg } from "../../tags/timer/parseTimerArg";
import * as db from "../../lib/db";
import { v4 as uuidv4 } from "uuid";

const AUTOSAVE_DEBOUNCE_MS = 500;

// ── StateEffects ────────────────────────────────────────────────────────────
export const setListItemsEffect    = StateEffect.define<Map<string, boolean>>();
export const toggleListItemEffect  = StateEffect.define<string>();
export const refreshMathEffect     = StateEffect.define<undefined>();
const        dismissSuggestion     = StateEffect.define<undefined>();
const        cycleSuggestion       = StateEffect.define<undefined>();

// ── Inline ghost-text completion ─────────────────────────────────────────────
interface SuggestState {
  prefix: string;
  lineFrom: number;
  completions: string[];
  index: number;
}

const inlineSuggestField = StateField.define<{ s: SuggestState | null; dismissed: boolean }>({
  create: () => ({ s: null, dismissed: false }),
  update(value, tr) {
    if (tr.effects.some(e => e.is(dismissSuggestion)))
      return { s: null, dismissed: true };

    if (tr.effects.some(e => e.is(cycleSuggestion))) {
      if (!value.s || value.s.completions.length <= 1) return value;
      return { ...value, s: { ...value.s, index: (value.s.index + 1) % value.s.completions.length } };
    }

    let dismissed = tr.docChanged ? false : value.dismissed;

    const sel = tr.state.selection.main;
    if (!sel.empty) return { s: null, dismissed };

    const line = tr.state.doc.lineAt(sel.from);
    const before = tr.state.doc.sliceString(line.from, sel.from);
    if (!/^[a-zA-Z]\w*(:([a-zA-Z]\w*)?)?$/.test(before)) return { s: null, dismissed };
    // Don't show ghost text when cursor is mid-word (e.g. "ma|th:")
    const after = tr.state.doc.sliceString(sel.from, line.to);
    if (/\S/.test(after)) return { s: null, dismissed };
    if (dismissed) return { s: null, dismissed };

    const completions = registry.getAllCompletions()
      .map(c => c.label)
      .filter(lbl => lbl.startsWith(before) && lbl.length > before.length);

    if (completions.length === 0) return { s: null, dismissed };

    const same = value.s?.prefix === before && value.s?.lineFrom === line.from;
    const index = same ? Math.min(value.s!.index, completions.length - 1) : 0;
    return { s: { prefix: before, lineFrom: line.from, completions, index }, dismissed };
  },
});

class GhostTextWidget extends WidgetType {
  constructor(readonly ghost: string) { super(); }
  eq(other: GhostTextWidget) { return other.ghost === this.ghost; }
  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.ghost;
    span.style.cssText = "opacity:0.35;pointer-events:none;";
    return span;
  }
  ignoreEvent() { return true; }
}

const inlineSuggestPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged)
        this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const { s } = view.state.field(inlineSuggestField);
      if (!s) return Decoration.none;
      const ghost = s.completions[s.index].slice(s.prefix.length);
      if (!ghost) return Decoration.none;
      const pos = view.state.selection.main.from;
      return Decoration.set([
        Decoration.widget({ widget: new GhostTextWidget(ghost), side: 1 }).range(pos),
      ]);
    }
  },
  { decorations: v => v.decorations }
);

function acceptSuggestion(view: EditorView): boolean {
  const { s } = view.state.field(inlineSuggestField);
  if (!s) return false;
  const ghost = s.completions[s.index].slice(s.prefix.length);
  if (!ghost) return false;
  const pos = view.state.selection.main.from;
  view.dispatch({
    changes: { from: pos, to: pos, insert: ghost },
    selection: { anchor: pos + ghost.length },
  });
  return true;
}

// Escape is intentionally absent here — it's wired in createEditorExtensions
// so it can check ghost-text state AND fall back to hiding the window.
const inlineSuggestKeymap = [
  {
    key: "Tab",
    run(view: EditorView) {
      const { s } = view.state.field(inlineSuggestField);
      if (!s) return false;
      return acceptSuggestion(view);
    },
  },
];

// ── Bullet gutter ────────────────────────────────────────────────────────────
class BulletMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("span");
    el.textContent = "•";
    el.style.cssText =
      "color:currentColor;opacity:0.6;font-size:20px;display:block;text-align:center;line-height:1";
    return el;
  }
}
class EmptyMarker extends GutterMarker {
  toDOM() { return document.createElement("span"); }
}
const bulletM = new BulletMarker();
const emptyM = new EmptyMarker();

// ── Strikethrough decoration (regex scan — lezer tag unreliable) ─────────────
const strikeMark = Decoration.mark({ class: "cm-md-strike" });
const STRIKE_RE  = /~~([^~\n]+)~~/g;

function buildStrikeDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let m: RegExpExecArray | null;
    STRIKE_RE.lastIndex = 0;
    while ((m = STRIKE_RE.exec(text)) !== null) {
      builder.add(from + m.index, from + m.index + m[0].length, strikeMark);
    }
  }
  return builder.finish();
}

const strikePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildStrikeDecos(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildStrikeDecos(u.view);
    }
  },
  { decorations: (v) => v.decorations }
);

// ── Comment decoration ───────────────────────────────────────────────────────
const commentLineDeco = Decoration.line({ class: "cm-comment-line" });

function buildCommentDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (line.text.trimStart().startsWith("//")) {
        builder.add(line.from, line.from, commentLineDeco);
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const commentPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildCommentDecos(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildCommentDecos(u.view);
    }
  },
  { decorations: (v) => v.decorations }
);

// ── Markdown highlight style ─────────────────────────────────────────────────
const markdownHighlight = HighlightStyle.define([
  // Heading markers (#, ##, …) and other syntax marks — dimmed
  { tag: t.processingInstruction, opacity: "0.35" },

  // Headings — bold + accent tint
  { tag: t.heading1, fontWeight: "700", fontSize: "1.18em", color: "var(--color-accent)", opacity: "0.9" },
  { tag: t.heading2, fontWeight: "700", fontSize: "1.08em", color: "var(--color-accent)", opacity: "0.8" },
  { tag: t.heading3, fontWeight: "600", color: "var(--color-accent)", opacity: "0.7" },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "600", opacity: "0.6" },

  // Inline formatting
  { tag: t.strong,        fontWeight: "700" },
  { tag: t.emphasis,      fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", opacity: "0.55" },

  { tag: t.monospace, background: "transparent" },

  // Links & URLs
  { tag: t.url,  color: "var(--color-accent)", opacity: "0.75" },
  { tag: t.link, color: "var(--color-accent)" },
]);

// ── Markdown selection wrapping ───────────────────────────────────────────────
const markdownWrapHandler = EditorView.inputHandler.of((view, from, to, text) => {
  if (from === to) return false; // no selection — fall through to normal insert

  const selected = view.state.doc.sliceString(from, to);
  let open = "", close = "";

  if      (text === "*") { open = "*";  close = "*";  }
  else if (text === "`") { open = "`";  close = "`";  }
  else if (text === "~") { open = "~~"; close = "~~"; }
  else return false;

  view.dispatch({
    changes: { from, to, insert: `${open}${selected}${close}` },
    selection: { anchor: from + open.length, head: from + open.length + selected.length },
  });
  return true;
});

// ── Tag system factory (created per-note so it can close over noteId) ────────
interface TagFieldState {
  decos: DecorationSet;
  listItems: Map<string, boolean>;
  listLineSet: Set<number>;
}

function buildTagDecos(state: EditorState, listItems: Map<string, boolean>, noteId: string) {
  const content = state.doc.toString();
  const sections = parseNote(content);
  const cursorPos = state.selection.main.from;
  const allDecos = [];
  const listLineSet = new Set<number>();

  for (const section of sections) {
    if (section.tagName === null) continue;
    const proc = registry.get(section.tagName);
    if (!proc) continue;
    const result = proc.buildDecorations(section, { listItems, noteId, cursorPos });
    allDecos.push(...result.decorations);
    result.listLines.forEach((p) => listLineSet.add(p));
  }

  allDecos.sort((a, b) => a.from - b.from);
  return { decos: Decoration.set(allDecos, true), listLineSet };
}

function createEditorExtensions(noteId: string, onTimerStart?: (noteId: string, sectionIndex: number) => void) {
  // Tag StateField
  const tagField = StateField.define<TagFieldState>({
    create(state) {
      const listItems = new Map<string, boolean>();
      const { decos, listLineSet } = buildTagDecos(state, listItems, noteId);
      return { decos, listItems, listLineSet };
    },
    update(value, tr) {
      let { listItems } = value;
      let changed = tr.docChanged;

      for (const effect of tr.effects) {
        if (effect.is(setListItemsEffect)) {
          listItems = effect.value;
          changed = true;
        } else if (effect.is(toggleListItemEffect)) {
          listItems = new Map(listItems);
          const key = effect.value;
          listItems.set(key, !(listItems.get(key) ?? false));
          changed = true;
        } else if (effect.is(refreshMathEffect)) {
          changed = true;
        }
      }

      if (!changed) return value;
      const { decos, listLineSet } = buildTagDecos(tr.state, listItems, noteId);
      return { decos, listItems, listLineSet };
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.decos),
  });

  // Bullet gutter — suppressed on list-item lines
  const listAwareBulletGutter = gutter({
    lineMarker(view, line) {
      const docLine = view.state.doc.lineAt(line.from);
      if (docLine.length === 0) return emptyM;
      if (docLine.text.trimStart().startsWith("//")) return emptyM;
      const tagState = view.state.field(tagField);
      if (tagState.listLineSet.has(line.from)) return emptyM;
      return bulletM;
    },
    initialSpacer: () => bulletM,
  });

  // Enter on a timer line re-triggers full-screen (supports editing the value before restarting)
  const timerEnterKeymap = {
    key: "Enter",
    run(view: EditorView): boolean {
      const { state } = view;
      const sel = state.selection.main;
      if (!sel.empty) return false;

      const line = state.doc.lineAt(sel.from);
      const sections = parseNote(state.doc.toString());
      const section = sections.find(
        (s) => s.tagName === "timer" && s.headerFrom !== null && s.headerFrom === line.from,
      );
      if (!section) return false;

      const arg = resolveTimerArg(section.tagArg, section.tagLabel);
      if (arg === "pause" || arg === "stop") return false;

      let type: "countdown" | "pomo";
      let seconds: number;
      if (arg === "pomo") {
        type = "pomo";
        seconds = 25; // sentinel — pomo duration comes from pomoFocusMinutes inside timerManager
      } else {
        const parsed = parseTimerArg(arg);
        if (parsed === null) return false;
        type = "countdown";
        seconds = parsed;
      }

      timerManager.ensureState(noteId, section.sectionIndex, type, seconds, section.tagLabel ?? undefined);
      timerManager.markFresh(noteId, section.sectionIndex);
      if (onTimerStart) {
        onTimerStart(noteId, section.sectionIndex);
        // Prevent buildDecorations from also triggering the overlay on this note —
        // the new-note flow handles showing it directly.
        timerManager.clearFresh(noteId, section.sectionIndex);
      }

      const hasNextLine = line.number < state.doc.lines;
      if (hasNextLine) {
        // Move cursor off the timer line and force a tag rebuild — no newline added
        view.dispatch({
          selection: { anchor: line.to + 1 },
          effects: [refreshMathEffect.of(undefined)],
        });
        return true;
      }
      // Last line in doc: let default Enter add the newline, which triggers buildTagDecos
      return false;
    },
  };

  return { tagField, listAwareBulletGutter, timerEnterKeymap };
}

// ── Date formatter ───────────────────────────────────────────────────────────
function formatNoteDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const noteDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - noteDay.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();

  if (diffDays === 0) return `today ${time}`;
  if (diffDays === 1) return `yesterday ${time}`;

  const month = d.toLocaleString([], { month: "short" }).toLowerCase();
  const day = d.getDate();
  if (d.getFullYear() === now.getFullYear()) return `${month} ${day}`;
  return `${month} ${day}, ${d.getFullYear()}`;
}

// ── Component ────────────────────────────────────────────────────────────────
interface NoteEditorProps {
  noteId: string;
  onTimerStart?: (noteId: string, sectionIndex: number) => void;
}

export function NoteEditor({ noteId, onTimerStart }: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notes = useNotesStore((s) => s.notes);
  const updateContent = useNotesStore((s) => s.updateContent);
  const note = notes.find((n) => n.id === noteId);

  const scheduleSave = useCallback(
    (content: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updateContent(noteId, content).catch(console.error);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [noteId, updateContent]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const startDoc = note?.content ?? "";
    const { tagField, listAwareBulletGutter, timerEnterKeymap } =
      createEditorExtensions(noteId, onTimerStart);

    const state = EditorState.create({
      doc: startDoc,
      extensions: [
        history(),
        drawSelection(),
        markdownWrapHandler,
        keymap.of([...inlineSuggestKeymap, timerEnterKeymap, ...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(markdownHighlight),
        strikePlugin,
        commentPlugin,
        listAwareBulletGutter,
        tagField,
        inlineSuggestField,
        inlineSuggestPlugin,
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "100%", fontFamily: "var(--font-mono)", fontSize: "var(--font-size-editor)", color: "var(--text)" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content": { padding: "14px 16px", minHeight: "100%", lineHeight: "1.75", caretColor: "transparent", color: "var(--text)" },
          ".cm-gutters": { background: "transparent", border: "none", paddingLeft: "8px", paddingRight: "4px", color: "var(--text)", display: "none" },
          ".cm-gutterElement": { display: "flex", alignItems: "center", justifyContent: "center", width: "20px" },
          ".cm-comment-line": { opacity: "0.4", fontStyle: "italic" },
          ".cm-md-strike": { textDecoration: "line-through", opacity: "0.6" },
          ".cm-line": { padding: "0" },
          ".cm-cursor": { borderLeftWidth: "2px", borderLeftColor: "var(--color-accent)" },
          "&.cm-focused .cm-selectionBackground": { background: "var(--selection-bg)" },
          ".cm-selectionBackground": { background: "var(--selection-bg)" },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            scheduleSave(update.state.doc.toString());

            // Detect newly typed timer control commands (timer:pause / timer:stop)
            const newSections = parseNote(update.state.doc.toString());
            const prevSections = parseNote(update.startState.doc.toString());

            const prevControlKeys = new Set(
              prevSections
                .filter((s) => s.tagName === "timer" && (s.tagArg === "pause" || s.tagArg === "stop"))
                .map((s) => `${s.sectionIndex}:${s.tagArg}`)
            );

            for (const section of newSections) {
              if (section.tagName !== "timer") continue;
              if (section.tagArg !== "pause" && section.tagArg !== "stop") continue;
              const key = `${section.sectionIndex}:${section.tagArg}`;
              if (!prevControlKeys.has(key)) {
                if (section.tagArg === "pause") {
                  timerManager.pauseNearest(noteId, section.sectionIndex);
                } else {
                  timerManager.stopNearest(noteId, section.sectionIndex);
                }
              }
            }
          }
          for (const tr of update.transactions) {
            for (const effect of tr.effects) {
              if (effect.is(toggleListItemEffect)) {
                const key = effect.value;
                const { listItems } = update.state.field(tagField);
                const checked = listItems.get(key) ?? false;
                const parsed = JSON.parse(key) as {
                  noteId: string; sectionIndex: number; content: string; occurrence: number;
                };
                db.setListItem(
                  uuidv4(),
                  parsed.noteId,
                  parsed.sectionIndex,
                  parsed.content,
                  parsed.occurrence,
                  checked
                ).catch(console.error);
              }
            }
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
    view.focus();

    listProcessor.setToggleFn((key) => {
      view.dispatch({ effects: toggleListItemEffect.of(key) });
    });

    db.getListItemsForNote(noteId).then((rows) => {
      const map = new Map<string, boolean>();
      const occurrenceCount = new Map<string, number>();
      for (const row of rows) {
        const occKey = `${row.section_index}::${row.content}`;
        const occ = occurrenceCount.get(occKey) ?? 0;
        occurrenceCount.set(occKey, occ + 1);
        const key = makeListItemKey(noteId, row.section_index, row.content, row.occurrence);
        map.set(key, row.checked);
      }
      view.dispatch({ effects: setListItemsEffect.of(map) });
    }).catch(console.error);

    const unsubRates = addRatesUpdateListener(() => {
      view.dispatch({ effects: refreshMathEffect.of(undefined) });
    });

    return () => {
      unsubRates();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
      {note?.updated_at && (
        <div className="note-date-footer">{formatNoteDate(note.updated_at)}</div>
      )}
    </div>
  );
}
