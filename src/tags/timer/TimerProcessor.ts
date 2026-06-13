import { Decoration } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import type { Completion } from "@codemirror/autocomplete";
import type { Section } from "../../types";
import type { TagProcessor, ProcessorContext, ProcessorResult } from "../TagRegistry";
import { timerManager } from "./timerManager";
import { parseTimerArg, resolveTimerArg, resolveTimerLabel } from "./parseTimerArg";

export class TimerProcessor implements TagProcessor {
  name = "timer";

  buildDecorations(section: Section, ctx: ProcessorContext): ProcessorResult {
    const decos: Range<Decoration>[] = [];
    if (section.headerFrom === null || section.headerTo === null) {
      return { decorations: [], listLines: [] };
    }

    const arg = resolveTimerArg(section.tagArg, section.tagLabel);

    if (arg === "pause" || arg === "stop") {
      // Typed control command → fade decoration (always, regardless of cursor)
      decos.push(
        Decoration.line({ attributes: { class: "cm-timer-command-line" } })
          .range(section.headerFrom),
      );
      return { decorations: decos, listLines: [] };
    }

    // Don't render widget while cursor is on the header line — let the user finish typing
    const onHeaderLine =
      ctx.cursorPos >= section.headerFrom && ctx.cursorPos <= section.headerTo;
    if (onHeaderLine) {
      return { decorations: [], listLines: [] };
    }

    if (arg === "pomo") {
      const label = resolveTimerLabel(section.tagArg, section.tagLabel);
      timerManager.ensureState(ctx.noteId, section.sectionIndex, "pomo", 25, label);
      if (timerManager.claimFresh(ctx.noteId, section.sectionIndex)) {
        decos.push(
          Decoration.line({ attributes: { class: "cm-timer-auto-hide" } })
            .range(section.headerFrom),
        );
        return { decorations: decos, listLines: [section.headerFrom] };
      }
      // Not fresh: show raw text, no widget
      return { decorations: [], listLines: [] };
    }

    // Countdown: parse "5" → 300s or "1,5" → 65s
    const parsedSeconds = parseTimerArg(arg);
    if (parsedSeconds === null) {
      return { decorations: [], listLines: [] };
    }

    const label = resolveTimerLabel(section.tagArg, section.tagLabel);
    timerManager.ensureState(ctx.noteId, section.sectionIndex, "countdown", parsedSeconds, label);
    if (timerManager.claimFresh(ctx.noteId, section.sectionIndex)) {
      decos.push(
        Decoration.line({ attributes: { class: "cm-timer-auto-hide" } })
          .range(section.headerFrom),
      );
      return { decorations: decos, listLines: [section.headerFrom] };
    }
    // Not fresh: show raw text, no widget
    return { decorations: [], listLines: [] };
  }

  getCompletions(): Completion[] {
    return [
      { label: "timer:",      type: "keyword", detail: "Countdown timer" },
      { label: "timer:pomo",  type: "keyword", detail: "Pomodoro timer" },
      { label: "timer:pause", type: "keyword", detail: "Pause nearest timer" },
      { label: "timer:stop",  type: "keyword", detail: "Reset nearest timer" },
    ];
  }
}

export const timerProcessor = new TimerProcessor();
