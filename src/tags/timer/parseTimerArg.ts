// When the user writes "timer: 5" (space after colon), NoteParser puts "" in tagArg
// and "5" in tagLabel. These two helpers normalise that so the timer code doesn't
// need to care whether the user included a space after the colon.

export function resolveTimerArg(tagArg: string | null, tagLabel: string | null): string {
  if (tagArg) return tagArg;
  if (!tagLabel) return "";
  return tagLabel.split(/\s+/)[0] ?? "";
}

// Returns the human-readable label, skipping the first token when it was used as the arg.
export function resolveTimerLabel(tagArg: string | null, tagLabel: string | null): string | undefined {
  if (tagArg) return tagLabel ?? undefined;
  if (!tagLabel) return undefined;
  const rest = tagLabel.split(/\s+/).slice(1).join(" ");
  return rest || undefined;
}

// Returns total seconds for a timer arg string, or null if invalid.
// "5"    → 300  (5 minutes)
// "1,5"  → 65   (1 min 5 sec)
// "1,50" → 110  (1 min 50 sec)
export function parseTimerArg(arg: string): number | null {
  if (arg.includes(",")) {
    const parts = arg.split(",");
    if (parts.length !== 2) return null;
    const x = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    if (isNaN(x) || isNaN(y) || x < 0 || y < 0 || y >= 60) return null;
    const total = x * 60 + y;
    return total > 0 ? total : null;
  }
  const mins = parseInt(arg, 10);
  if (isNaN(mins) || mins <= 0) return null;
  return mins * 60;
}
