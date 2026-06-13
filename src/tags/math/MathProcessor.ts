import { Decoration, WidgetType } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import type { Completion } from "@codemirror/autocomplete";
import type { Section } from "../../types";
import type { TagProcessor, ProcessorContext, ProcessorResult } from "../TagRegistry";
import { getMathInstance, isRatesStale, getKnownCurrencies } from "./currency";

// Suppress result only when RHS of assignment is a single bare numeric literal
const LITERAL_ASSIGN_RE = /^[a-zA-Z_]\w*\s*=\s*-?\d+(\.\d+)?$/;

function shouldShowResult(expr: string): boolean {
  const clean = expr.split("//")[0].trim();
  return !LITERAL_ASSIGN_RE.test(clean);
}

function round2(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

function formatResult(result: unknown): string {
  if (result === undefined || result === null) return "";
  try {
    const math = getMathInstance();
    if (typeof result === "number") {
      if (result === Infinity) return "∞";
      if (result === -Infinity) return "-∞";
      if (isNaN(result)) return "";
      return round2(result);
    }
    const s = math.format(result, { precision: 8 });
    if (s === "NaN") return "";
    if (s === "Infinity") return "∞";
    if (s === "-Infinity") return "-∞";
    return s.replace(/-?\d+\.\d+/g, (m: string) => round2(parseFloat(m)));
  } catch {
    return "";
  }
}

function usesCurrency(expr: string): boolean {
  const currencies = getKnownCurrencies();
  if (currencies.size === 0) return false;
  for (const code of currencies) {
    if (new RegExp(`\\b${code}\\b`).test(expr)) return true;
  }
  return false;
}

class MathResultWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(other: MathResultWidget) { return other.text === this.text; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-math-result";
    span.textContent = `→ ${this.text}`;
    return span;
  }
  ignoreEvent() { return true; }
}

class MathErrorWidget extends WidgetType {
  eq(_other: MathErrorWidget) { return true; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-math-error";
    return span;
  }
  ignoreEvent() { return true; }
}

export class MathProcessor implements TagProcessor {
  name = "math";

  buildDecorations(section: Section, _ctx: ProcessorContext): ProcessorResult {
    const decos: Range<Decoration>[] = [];

    if (section.headerFrom !== null) {
      decos.push(
        Decoration.line({ attributes: { class: "cm-tag-header" } }).range(section.headerFrom)
      );
    }

    const math = getMathInstance();
    const stale = isRatesStale();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scope: Record<string, any> = {};

    for (const line of section.lines) {
      if (line.isComment || line.raw.trim() === "") continue;

      const expr = line.raw.split("//")[0].trim();
      if (!expr) continue;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = math.evaluate(expr, scope);

        if (shouldShowResult(expr) && result !== undefined && result !== null) {
          const formatted = formatResult(result);
          if (formatted) {
            const staleTag = stale && usesCurrency(expr) ? " ⚠" : "";
            decos.push(
              Decoration.widget({
                widget: new MathResultWidget(formatted + staleTag),
                side: -1,
              }).range(line.from)
            );
            decos.push(
              Decoration.line({ attributes: { class: "cm-math-line" } }).range(line.from)
            );
          }
        }
      } catch {
        decos.push(
          Decoration.widget({ widget: new MathErrorWidget(), side: -1 }).range(line.from)
        );
        decos.push(
          Decoration.line({ attributes: { class: "cm-math-line" } }).range(line.from)
        );
      }
    }

    return { decorations: decos, listLines: [] };
  }

  getCompletions(): Completion[] {
    return [{ label: "math:", type: "keyword", detail: "Math expressions & conversions" }];
  }
}

export const mathProcessor = new MathProcessor();
