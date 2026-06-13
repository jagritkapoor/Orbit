# Orbit

A keyboard-first scratchpad that lives in your menu bar.

Write notes, do math, check off tasks, and run timers — all in plain text, all in one place. `Cmd+Shift+Space` to open. `Escape` to vanish.

---

## Features

- **Notes** — Plain text, auto-saved, navigate with `Cmd+[` / `Cmd+]`
- **Math** — Type `math:` and the lines below become a live calculator with unit and currency conversions
- **Lists** — Type `list:` for interactive checkboxes
- **Timers** — Type `timer:5` for a 5-minute countdown, `timer:pomo` for a Pomodoro — runs in the background even when the app is hidden
- **Markdown** — Bold, italic, strikethrough, and headings render as you type
- **Fuzzy search** — `Cmd+F` to search across all your notes
- **Dark / light mode** — Manual toggle, persists across sessions

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+Space` | Show / hide Orbit |
| `Cmd+N` | New note |
| `Cmd+[` / `Cmd+]` | Navigate notes |
| `Cmd+Backspace` | Delete note (5-second undo) |
| `Cmd+F` | Search notes |
| `Escape` | Hide Orbit |

> On Windows, replace `Cmd` with `Ctrl`.

## Stack

- [Tauri 2](https://tauri.app) — Rust shell, ~5MB binary
- [React 18](https://react.dev) + TypeScript
- [CodeMirror 6](https://codemirror.net) — editor
- [SQLite](https://www.sqlite.org) — local storage
- [mathjs](https://mathjs.org) — math evaluation

## Development

```bash
npm install
npm run tauri dev
```

Requires [Rust](https://rustup.rs) and [Node.js](https://nodejs.org) (v20+).

## Building

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

## Releases

Releases are built automatically via GitHub Actions when a tag is pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This produces a `.dmg` for macOS and an `.msi` installer for Windows, attached as a draft GitHub Release.
