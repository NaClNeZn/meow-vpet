# meow-vpet

A Live2D virtual desktop pet powered by AI. Built with Electron + Vue 3 + PixiJS, meow-vpet brings an interactive Live2D companion to your desktop that can chat with you via a streaming AI backend.

> meow-vpet is derived from the [meow-tool](https://github.com/naclnezn/meow-tool) project. It reuses meow-tool's backend (multi-vendor LLM router + Agent/Skill/MCP orchestration) and adds a Live2D renderer, an Electron desktop shell, and a chat UI on top.

---

## Features

- **Live2D Companion** — Render Cubism 2 / Cubism 4 models with PixiJS. Eye tracking follows your cursor across the whole screen, even outside the pet window.
- **AI Streaming Chat** — Talk to your pet via a streaming chat panel (SSE). Conversations keep context through persistent sessions.
- **Always-on-top, Frameless, Transparent** — The pet floats on top of your desktop with a transparent background, without cluttering your taskbar.
- **Long-press to Drag** — Press and hold the model for 3 seconds (with a circular progress indicator) to drag it anywhere on your screen.
- **Adjustable Window & Model Size** — Slide the window scale (0.8–2.0) and model scale (0.3–2.0) in real time. Settings persist across restarts.
- **Model Management** — Built-in models are copied to your user directory on first launch. Drop new model folders into `~/.meow-vpet/models/` and they appear in the picker automatically.
- **meow-tool Integration** — On startup, meow-vpet automatically launches a local meow-tool backend (or reuses one that's already running) for AI routing and orchestration.
- **Skill & Agent Configuration** — Pick the default agent and toggle skills from the settings panel, all synced with meow-tool's config.

---

## Requirements

- **Node.js** ≥ 20.0.0
- **Windows**, **macOS**, or **Linux**
- A working [meow-tool](https://github.com/naclnezn/meow-tool) installation (optional — meow-vpet can auto-spawn it via `meow start`, `npx meow-tool start`, or a local dev path)

---

## Installation

### Option A — Run via npx (no install)

```bash
npx meow-vpet
```

This pulls the latest published version (currently `0.1.0`) from npm and launches the pet directly. On first launch, the built-in Live2D models are copied to `~/.meow-vpet/models/`.

### Option B — Global install

```bash
npm install -g meow-vpet
meow-vpet
```

### Option C — Build an installer from source

```bash
git clone https://github.com/naclnezn/meow-vpet.git
cd meow-vpet
npm install

# Build for your platform
npm run build:win    # Windows NSIS installer
npm run build:mac    # macOS .dmg
npm run build:linux  # Linux .AppImage
```

The installer appears in the `release/` directory.

### Option D — Run from source (dev mode)

```bash
git clone https://github.com/naclnezn/meow-vpet.git
cd meow-vpet
npm install
npm run dev
```

---

## Usage

### Basic interactions

| Action            | How                                                                    |
|-------------------|------------------------------------------------------------------------|
| Move the pet      | Press and hold the model for 3 seconds, then drag                      |
| Open chat         | Click the **+** button at the top-right corner of the window           |
| Close chat        | Click the **×** button (same position)                                 |
| Open settings     | Right-click the pet → **打开设置** (Open Settings), or right-click the tray icon → **设置** (Settings) |
| Show / hide pet   | Click the tray icon to toggle, or right-click the tray icon → **显示 / 隐藏** |
| Quit              | Right-click the tray icon → **退出** (Quit), or right-click the pet → **退出** |

### Settings panel

Right-click the pet and choose **打开设置**, or right-click the tray icon and choose **设置**:

1. **Service** — Set the meow-tool backend URL (default `http://localhost:4399`).
2. **Live2D** — Pick an installed model from the dropdown. Models are auto-detected from `~/.meow-vpet/models/`. Also pick the default agent here.
3. **Display** — Adjust window size (0.8–2.0) and model size (0.3–2.0) sliders. Changes apply instantly and persist after a 500 ms debounce.
4. **System Prompt** — Add a system prompt that is prepended to every message you send.
5. **Skills** — Toggle meow-tool skills on or off.

---

## Configuration

All user configuration lives in `~/.meow-vpet/config.json`. The file is created on first launch with sensible defaults and validated with zod.

| Field              | Type    | Default                              | Description                                                                 |
|--------------------|---------|--------------------------------------|-----------------------------------------------------------------------------|
| `meowToolUrl`      | string  | `http://localhost:4399`              | meow-tool backend URL                                                       |
| `live2dModelPath`  | string  | `models/Mao/Mao.model3.json`         | Path to the active model, relative to `~/.meow-vpet/`                       |
| `agentId`          | string  | —                                    | Default agent id used for chat                                              |
| `systemPrompt`     | string  | —                                    | Prepended to the message list on every send                                |
| `windowX`          | number  | —                                    | Last window X position (auto-saved)                                         |
| `windowY`          | number  | —                                    | Last window Y position (auto-saved)                                         |
| `windowSizeScale`  | number  | `1.0`                                | Window size multiplier (0.8–2.0) on a 360×480 base                          |
| `modelScale`       | number  | `1.0`                                | Model size multiplier (0.3–2.0) relative to the auto-fit scale              |

---

## Adding Live2D Models

1. Drop a model folder into `~/.meow-vpet/models/`. Each folder should contain a `*.model3.json` (Cubism 4) or `*.model.json` (Cubism 2) file plus its resources (`.moc3`/`.moc`, textures, motions, expressions).
2. Open the settings panel — the new model appears in the Live2D dropdown automatically.
3. Select it and click **Save**.

Built-in models (`Mao`, `shizuku`) are copied on first launch and will not be overwritten if you modify them locally.

---

## How it works

```
┌──────────────────────────────────────────────────────────┐
│                    meow-vpet (Electron app)               │
│                                                          │
│  Main process (Node + TS)                                │
│   - BrowserWindow, tray, IPC handlers                    │
│   - Spawns meow-tool backend, health check, graceful exit│
│   - Config file (zod-validated)                          │
│   - Model management + custom `meow-model://` protocol   │
│                  │ IPC (contextBridge)                    │
│                  ▼                                       │
│  Renderer process (Vue 3 + TS + PixiJS)                  │
│   - Live2D canvas (transparent, always-on-top)           │
│   - Streaming chat UI                                    │
│   - Settings panel (meow-tool style)                     │
│                  │ HTTP / SSE                            │
└──────────────────┼───────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────┐
│         meow-tool backend (Hono + SQLite)                │
│         http://localhost:4399                             │
│   - POST /v1/chat/completions  (OpenAI, SSE streaming)   │
│   - POST /v1/messages          (Anthropic, SSE streaming)│
│   - GET  /v1/config/*          (agents / skills / models)│
│   - POST /v1/sessions          (session management)      │
└──────────────────────────────────────────────────────────┘
```

meow-vpet and meow-tool are decoupled — they communicate only over local HTTP/SSE. You can run meow-tool independently for debugging, or let meow-vpet spawn it for you.

---

## Development

### Scripts

| Command              | Description                                                                  |
|----------------------|------------------------------------------------------------------------------|
| `npm run dev`        | Start electron-vite dev (main + preload + renderer) with hot reload          |
| `npm run build`      | Copy resources, build renderer/main, produce unpacked output                 |
| `npm run build:win`  | Build a Windows NSIS installer                                               |
| `npm run build:mac`  | Build a macOS `.dmg`                                                         |
| `npm run build:linux`| Build a Linux `.AppImage`                                                    |
| `npm run typecheck`  | Run TypeScript checks for both Node and Web configs                          |

### Recommended dev workflow

For day-to-day development, run meow-tool independently so you can see its logs and hot-reload the backend:

```bash
# Terminal 1 — backend
cd /path/to/meow-tool
npm start

# Terminal 2 — desktop pet
cd /path/to/meow-vpet
npm run dev
```

meow-vpet's health check will detect the running backend at `http://localhost:4399` and reuse it instead of spawning another one.

---

## Troubleshooting

| Symptom                              | Fix                                                                                                                                                                  |
|--------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Black background behind the pet      | meow-vpet already uses `transparent: true` + `backgroundColor: '#00000000'`. On Windows, ensure the GPU compositor is enabled; restart the app if needed.            |
| Chat returns no response             | Check the meow-tool service URL in settings. Make sure meow-tool is running (`http://localhost:4399/api` should return a health response).                            |
| Model does not appear in the picker  | Confirm the model folder is under `~/.meow-vpet/models/` and contains a `*.model3.json` or `*.model.json` file.                                                      |
| Window size slider has no effect     | Restart the app. On Windows, `setSize` may be silently ignored under certain frameless+transparent configurations; meow-vpet works around this with a resize guard. |
| `+` button drifts after dragging     | Already fixed in current versions. meow-vpet uses fixed 360×480 base dimensions and disables pointer emit during drag to prevent drift.                              |

---

## License

[MIT](./package.json) © naclnezn

Live2D Cubism SDK has its own license — free for small businesses (annual revenue < ¥10M JPY). Model assets may have separate copyrights; please respect the terms of each model you use.

---

## Related Projects

- [meow-tool](https://github.com/naclnezn/meow-tool) — The backend LLM router + Agent/Skill/MCP orchestrator
- [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) — PixiJS plugin for Live2D rendering
- [Live2D Cubism SDK for Web](https://www.live2d.com/en/sdk/about/) — Official Live2D core
