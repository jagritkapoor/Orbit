import type { Section, LineInfo } from "../types";

// matches: tagName:(tagArg)( tagLabel)
// e.g. "sum:", "timer:25 deep work", "list: groceries"
const TAG_RE = /^([a-zA-Z]\w*):([\w,]*)(\s+(.*))?$/;

// Remove trailing blank and comment lines so processors see clean section content.
// This prevents separator lines (blank gaps, "// ── next ──" headers) from being
// attributed to the wrong section — which would misplace block widgets (sum total)
// and leak blank lines into listLineSet (causing list Enter-capture past section end).
function trimTrailing(lines: LineInfo[]): LineInfo[] {
  let end = lines.length;
  while (end > 0 && (lines[end - 1].raw.trim() === "" || lines[end - 1].isComment)) {
    end--;
  }
  return end === lines.length ? lines : lines.slice(0, end);
}

// Split a list section at its first blank line that has more content after it.
// A lone trailing blank (cursor position, nothing follows) stays in the list as
// the placeholder checkbox. The instant the user presses Enter — creating a
// second line after that blank — the blank now "has something after it" and
// the list closes. Everything from that blank onward becomes a null section
// so it receives no decorations.
function splitListAtBoundary(sections: Section[]): Section[] {
  const result: Section[] = [];
  for (const section of sections) {
    if (section.tagName !== "list") {
      result.push(section);
      continue;
    }
    // First blank that has ANY content after it (blank or non-blank) → terminator.
    // A blank at the very end of the section (i + 1 >= length) stays as placeholder.
    let splitAt = -1;
    for (let i = 0; i < section.lines.length; i++) {
      if (section.lines[i].raw.trim() === "" && i + 1 < section.lines.length) {
        splitAt = i;
        break;
      }
    }
    if (splitAt === -1) {
      result.push(section);
      continue;
    }
    result.push({ ...section, lines: section.lines.slice(0, splitAt) });
    result.push({
      tagName: null,
      tagArg: null,
      tagLabel: null,
      lines: section.lines.slice(splitAt),
      sectionIndex: result.length,
      headerFrom: null,
      headerTo: null,
    });
  }
  return result;
}

export function parseNote(content: string): Section[] {
  const rawLines = content.split("\n");
  const sections: Section[] = [];

  let current: Section = {
    tagName: null,
    tagArg: null,
    tagLabel: null,
    lines: [],
    sectionIndex: 0,
    headerFrom: null,
    headerTo: null,
  };

  let pos = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const lineFrom = pos;
    const lineTo = pos + raw.length;
    pos = lineTo + 1; // +1 for newline

    const m = raw.match(TAG_RE);
    if (m) {
      current.lines = trimTrailing(current.lines);
      sections.push(current);
      current = {
        tagName: m[1],
        tagArg: m[2] || null,
        tagLabel: m[4]?.trim() || null,
        lines: [],
        sectionIndex: sections.length,
        headerFrom: lineFrom,
        headerTo: lineTo,
      };
    } else {
      const info: LineInfo = {
        raw,
        isComment: raw.trimStart().startsWith("//"),
        lineNumber: i,
        from: lineFrom,
        to: lineTo,
      };
      current.lines.push(info);
    }
  }

  // Do NOT trim the last section — it's still being edited. Trailing blank lines
  // there are the cursor's current position and needed for live placeholder rendering.
  sections.push(current);
  return splitListAtBoundary(sections).filter(
    (s) => s.tagName !== null || s.lines.length > 0
  );
}
