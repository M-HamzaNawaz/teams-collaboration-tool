# Confide Desktop App — Tauri Plan

**Goal:** native desktop apps for Windows, macOS, and Linux from one codebase,
installing like a real program (own icon, own window, taskbar/dock presence,
native notifications) — without rebuilding the product.

## Architecture decision

Confide is a Next.js app with server rendering and API routes; those live on
Vercel and cannot be bundled into a desktop binary. So the desktop app is a
**Tauri v2 shell**: a native window whose webview loads
`https://teams-collaboration-tool-bwfb.vercel.app`, plus a small native bridge
for the things a browser tab cannot do well. This is the same architecture as
Slack/Discord desktop. Consequences:

- Every web deploy updates the desktop app instantly — no reinstalls.
- The shell itself changes rarely (only when we touch native features).
- Internet is required — same as the product itself.
- Login sessions persist in the webview's cookie store, like a browser.

## Phases

### Phase 0 — Toolchain (Linux dev machine)
- Rust via rustup (user-level install, no sudo)
- System packages (sudo needed): `libwebkit2gtk-4.1-dev build-essential
  libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`
- `@tauri-apps/cli` as a dev dependency in the repo

### Phase 1 — Working shell (Linux first)
- `desktop/` folder in the repo with the Tauri project (`src-tauri`)
- Window config: loads the production URL, min size, "Confide" title
- App icon: generate the full icon set from a 1024px "C" mark
  (`tauri icon`)
- Verify: login persists across restarts, chat/realtime works, files
  upload/download
- Deliverable: `.deb` + AppImage the user can install and test

### Phase 2 — Native behaviors
- **Single instance** — clicking the icon twice focuses the open window
- **Window state** — remembers size/position
- **External links** — open in the system browser, not inside the shell
- **Notifications** — the webview's `Notification` API is unreliable in
  WebView2/WKWebView, so the web app detects the shell and calls the Tauri
  notification plugin instead (small adapter in
  `src/lib/notifications/desktop.ts`; capability scoped to our domain only)
- **Unread badge** — dock badge (macOS) / taskbar overlay (Windows) fed by
  the same unread counts the bell uses
- Optional later: tray icon, launch-at-login, deep links (`confide://`)

### Phase 3 — Builds for all three OS
Tauri cannot cross-compile; each OS builds its own binary. GitHub Actions
(`tauri-action`) with a 3-OS matrix builds on every tagged release:
- Windows → `.msi` + NSIS `.exe`
- macOS → `.dmg` (Intel + Apple Silicon universal)
- Linux → `.deb` + AppImage
Artifacts attach to a GitHub Release.

### Phase 4 — Distribution & signing
- Start: share installers from GitHub Releases (free)
- **Windows unsigned** = SmartScreen warning ("More info → Run anyway").
  Fix costs money: OV certificate (~$100+/yr) or Azure Trusted Signing
  (~$10/mo). Can defer.
- **macOS unsigned** = Gatekeeper blocks; users right-click → Open once.
  Proper fix: Apple Developer Program ($99/yr) for signing + notarization.
  Decision for the boss.
- **Linux**: no signing needed.
- Shell auto-update (Tauri updater plugin + free local signing key):
  worthwhile once the shell stabilizes; web content updates need nothing.

### Phase 5 — Polish
- Offline screen: friendly "no connection — retrying" page instead of a
  webview error when the network drops
- Keyboard shortcuts routed natively (⌘K etc. already work in-page)
- QA pass on all three OS

## What we need

| Item | Who | Cost |
|---|---|---|
| Rust + system packages on dev machine | me, needs **sudo** once | free |
| App icon (1024px PNG of the C mark) | I generate from the design system | free |
| GitHub repo (already exists) + Actions enabled | user pushes; Actions free tier covers this | free |
| Windows/macOS test machine or a colleague to test installers | user/team | free |
| Apple Developer Program (only for signed macOS) | boss decision | $99/yr |
| Windows code-signing cert (only to remove SmartScreen warning) | boss decision | ~$100/yr or ~$10/mo, deferrable |

## Order of work
1. Phase 0+1 in one sitting → installable Linux app to try
2. Phase 2 (notifications + badge are the real wins)
3. Phase 3 CI matrix → Windows/macOS installers to hand to the team
4. Signing decisions once the team confirms the app feels right
