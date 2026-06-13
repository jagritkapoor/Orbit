import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import type { Note } from "../types";

interface Props {
  notes: Note[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

const FUSE_OPTIONS = {
  keys: ["content"],
  includeMatches: true,
  threshold: 0.35,
  minMatchCharLength: 1,
  ignoreLocation: true,
};

function getSnippet(content: string, query: string): string {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "empty note";
  if (!query) return lines[0].slice(0, 90);

  const lower = query.toLowerCase();
  const matchLine = lines.find((l) => l.toLowerCase().includes(lower)) ?? lines[0];
  const idx = matchLine.toLowerCase().indexOf(lower);
  if (idx === -1) return matchLine.slice(0, 90);

  const start = Math.max(0, idx - 28);
  const end = Math.min(matchLine.length, idx + query.length + 52);
  return (start > 0 ? "…" : "") + matchLine.slice(start, end) + (end < matchLine.length ? "…" : "");
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  const month = d.toLocaleString([], { month: "short" }).toLowerCase();
  const day = d.getDate();
  if (d.getFullYear() === now.getFullYear()) return `${month} ${day}`;
  return `${month} ${day}, ${d.getFullYear()}`;
}

export function SearchOverlay({ notes, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 250);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  const fuse = useMemo(() => new Fuse(notes, FUSE_OPTIONS), [notes]);

  const results = useMemo(() => {
    if (query.trim().length === 0) return notes.slice(0, 7);
    return fuse.search(query).slice(0, 7).map((r) => r.item);
  }, [query, fuse, notes]);

  useEffect(() => setSelectedIdx(0), [query]);

  const commit = (id: string) => {
    setClosing(true);
    setTimeout(() => onSelect(id), 250);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (results[selectedIdx]) commit(results[selectedIdx].id);
    }
  };

  return (
    <div className={`search-overlay${closing ? " closing" : ""}`} onClick={handleClose}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="search-input"
            placeholder="search notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {results.length > 0 && (
          <div className="search-results">
            {query.trim().length === 0 && (
              <div className="search-section-label">recent</div>
            )}
            {results.map((note, i) => (
              <div
                key={note.id}
                className={`search-result${i === selectedIdx ? " selected" : ""}`}
                onClick={() => commit(note.id)}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="search-result-snippet">
                  {getSnippet(note.content, query)}
                </span>
                <span className="search-result-date">
                  {formatDate(note.updated_at)}
                </span>
              </div>
            ))}
          </div>
        )}

        {query.trim().length > 0 && results.length === 0 && (
          <div className="search-empty">no results</div>
        )}
      </div>
    </div>
  );
}
