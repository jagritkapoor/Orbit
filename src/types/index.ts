export interface LineInfo {
  raw: string;
  isComment: boolean;
  lineNumber: number;
  from: number;
  to: number;
}

export interface Section {
  tagName: string | null;
  tagArg: string | null;
  tagLabel: string | null;
  lines: LineInfo[];
  sectionIndex: number;
  headerFrom: number | null;
  headerTo: number | null;
}

export interface Note {
  id: string;
  content: string;
  created_at: number;
  updated_at: number;
}

export interface TimerRow {
  id: string;
  note_id: string;
  section_index: number;
  timer_type: "countdown" | "pomo";
  duration_seconds: number;
  remaining_seconds: number;
  state: "idle" | "running" | "paused" | "done" | "break";
  pomo_cycle: number;
  started_at: number | null;
  phase: "focus" | "break";
}

export interface ListItemRow {
  id: string;
  note_id: string;
  section_index: number;
  content: string;
  occurrence: number;
  checked: boolean;
}

export interface Settings {
  theme: "auto" | "light" | "dark";
  font_size: number;
  pomo_work_minutes: number;
  pomo_break_minutes: number;
  currency_base: string;
  currency_rates_updated_at: number;
}
