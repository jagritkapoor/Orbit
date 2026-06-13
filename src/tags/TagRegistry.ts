import type { Range } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import type { Completion } from "@codemirror/autocomplete";
import type { Section } from "../types";

export interface ProcessorContext {
  listItems: Map<string, boolean>;
  noteId: string;
  cursorPos: number;
}

export interface ProcessorResult {
  decorations: Range<Decoration>[];
  listLines: number[]; // line.from positions of list-item lines (for bullet gutter suppression)
}

export interface TagProcessor {
  name: string;
  buildDecorations(section: Section, ctx: ProcessorContext): ProcessorResult;
  getCompletions(): Completion[];
}

export class TagRegistry {
  private map = new Map<string, TagProcessor>();

  register(p: TagProcessor) {
    this.map.set(p.name, p);
  }

  get(name: string): TagProcessor | undefined {
    return this.map.get(name);
  }

  isKnown(name: string): boolean {
    return this.map.has(name);
  }

  getAllCompletions(): Completion[] {
    return [...this.map.values()].flatMap((p) => p.getCompletions());
  }
}

export const registry = new TagRegistry();
