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

## Installing on macOS

After dragging Orbit into Applications and opening it for the first time, macOS may show **"Orbit is damaged and can't be opened."** This is a Gatekeeper quarantine warning for apps downloaded outside the App Store. Run this command once to clear it:

```bash
xattr -cr /Applications/Orbit.app
```

Then open Orbit normally.

## Uninstalling

Deleting the app from Applications does **not** delete your notes. To fully remove Orbit:

1. Delete `Orbit.app` from `/Applications`
2. Delete the data folder: `~/Library/Application Support/com.jagrit.orbit`

In Finder: press `Cmd+Shift+G`, paste `~/Library/Application Support`, then delete the `com.jagrit.orbit` folder (toggle hidden files with `Cmd+Shift+.` if it's not visible).

**Windows:**

1. Uninstall Orbit from **Settings → Apps**
2. Press `Win+R`, type `%APPDATA%\com.jagrit.orbit`, hit Enter, and delete the folder

## Releases

Releases are built automatically via GitHub Actions when a tag is pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This produces a `.dmg` for macOS and an `.msi` installer for Windows, attached as a draft GitHub Release.
