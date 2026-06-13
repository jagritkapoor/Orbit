import { Decoration, WidgetType, type EditorView } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import type { Completion } from "@codemirror/autocomplete";
import type { Section } from "../../types";
import type { TagProcessor, ProcessorContext, ProcessorResult } from "../TagRegistry";

// Shared effect import — defined in NoteEditor to avoid circular deps
// The widget dispatches via a callback injected at build time.
type ToggleFn = (key: string) => void;

export function makeListItemKey(
  noteId: string,
  sectionIndex: number,
  content: string,
  occurrence: number
): string {
  return JSON.stringify({ noteId, sectionIndex, content, occurrence });
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly itemKey: string,
    readonly checked: boolean,
    readonly onToggle: ToggleFn
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.itemKey === this.itemKey && other.checked === this.checked;
  }

  toDOM(_view: EditorView): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-checkbox-wrap";
    wrap.setAttribute("aria-checked", String(this.checked));
    wrap.setAttribute("contenteditable", "false");

    const box = document.createElement("span");
    box.className = this.checked ? "cm-checkbox cm-checkbox-checked" : "cm-checkbox";

    if (this.checked) {
      box.innerHTML =
        `<svg viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">` +
        `<polyline points="1,4 3.8,7 9,1" stroke="white" stroke-width="1.6" ` +
        `stroke-linecap="round" stroke-linejoin="round"/>` +
        `</svg>`;
    }

    wrap.appendChild(box);

    wrap.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onToggle(this.itemKey);
    });

    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

export class ListProcessor implements TagProcessor {
  name = "list";
  private onToggle: ToggleFn = () => {};

  setToggleFn(fn: ToggleFn) {
    this.onToggle = fn;
  }

  buildDecorations(section: Section, ctx: ProcessorContext): ProcessorResult {
    const decos: Range<Decoration>[] = [];
    const listLines: number[] = [];

    if (section.headerFrom !== null) {
      decos.push(
        Decoration.line({ attributes: { class: "cm-tag-header" } }).range(section.headerFrom)
      );
    }

    // Count occurrences of identical content for disambiguation
    const occurrenceCount = new Map<string, number>();

    for (const line of section.lines) {
      if (line.isComment) continue;
      // Lines that look like a tag declaration are not list items
      if (/^[a-zA-Z]\w*:/.test(line.raw.trim())) continue;

      if (line.raw.trim() === "") {
        // Empty line: show a placeholder checkbox so the user sees list context immediately
        decos.push(
          Decoration.widget({
            widget: new CheckboxWidget("", false, () => {}),
            side: -1,
          }).range(line.from)
        );
        decos.push(
          Decoration.line({ attributes: { class: "cm-list-item" } }).range(line.from)
        );
        listLines.push(line.from);
        continue;
      }

      const occ = occurrenceCount.get(line.raw) ?? 0;
      occurrenceCount.set(line.raw, occ + 1);

      const key = makeListItemKey(ctx.noteId, section.sectionIndex, line.raw, occ);
      const checked = ctx.listItems.get(key) ?? false;

      decos.push(
        Decoration.widget({
          widget: new CheckboxWidget(key, checked, this.onToggle),
          side: -1,
        }).range(line.from)
      );

      if (checked) {
        decos.push(
          Decoration.line({ attributes: { class: "cm-list-checked" } }).range(line.from)
        );
      } else {
        decos.push(
          Decoration.line({ attributes: { class: "cm-list-item" } }).range(line.from)
        );
      }

      listLines.push(line.from);
    }

    return { decorations: decos, listLines };
  }

  getCompletions(): Completion[] {
    return [{ label: "list:", type: "keyword", detail: "Interactive checklist" }];
  }
}

export const listProcessor = new ListProcessor();
