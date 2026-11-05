# CutFlow — Modular Video Editor

**CutFlow** is a modular video editor built with [Electron](https://www.electronjs.org/) and [TypeScript](https://www.typescriptlang.org/). Designed for timeline editing (video, audio, text) with a panel-based interface: media bin, preview, inspector, and timeline.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-33.x-blue.svg)](https://www.electronjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-yellow.svg)](https://vitejs.dev/)


## 📋 About the Project

CutFlow is a desktop video editor application that allows users to:

- Import media assets (video, audio, images)
- Arrange clips on multi-track timelines (video & audio)
- Add text clips (title card / lower-third)
- Trim, move, and set clip duration
- Preview editing results in real-time
- Configure clip properties via inspector (position, scale, color, transform)
- Save and load projects in `.cutflow.json` format
- Undo/redo support (history state)
- Auto-update via `electron-updater`



## 🛠️ Tech Stack

| Technology | Version | Usage |
|------------|---------|-------|
| Electron | ^33.2.1 | Desktop application framework |
| TypeScript | ^5.7.2 | Programming language (strict mode) |
| Vite | ^5.4.0 | Build tool & dev server |
| electron-vite | ^2.3.0 | Electron + Vite integration |
| Vitest | ^2.1.8 | Unit testing |
| lucide | ^1.68.0 | Icon library |
| electron-updater | ^6.3.9 | Auto-update |



## 📁 Project Structure

```
cutflow/
├── src/
│   ├── main/                 # Electron main process
│   ├── preload/              # Preload script (bridge main ↔ renderer)
│   ├── renderer/             # Renderer process (UI)
│   └── shared/               # Shared code between main & renderer
├── out/                      # Build output (gitignored)
├── electron.vite.config.ts   # electron-vite configuration
├── tsconfig.json             # TypeScript root config
├── tsconfig.node.json        # TypeScript config for Node/main
├── tsconfig.web.json         # TypeScript config for browser/renderer
├── package.json
└── README.md
```


## 🚀 Getting Started

### Prerequisites

Make sure you have installed:

- [Node.js](https://nodejs.org/) (recommended v18 or newer)
- [npm](https://www.npmjs.com/) (usually bundled with Node.js)

### Installation

1. Clone this repository:

```bash
git clone https://github.com/alth45/cutflow-video-edit.git
cd cutflow-video-edit
```

2. Install dependencies:

```bash
npm install
```

### Running in Development Mode

```bash
npm run dev
```

This will run the application in development mode with hot-reload.

### Build for Production

```bash
npm run build
```

Build output will be saved in the `out/` folder.

### Preview Production Build

```bash
npm run preview
```

### Type Checking

```bash
npm run typecheck
```

Or separately:

```bash
npm run typecheck:node   # Check types for main/preload/shared
npm run typecheck:web    # Check types for renderer
```


## 🏗️ Architecture

CutFlow uses a standard Electron architecture with three processes:

### 1. Main Process (`src/main/`)
Handles application lifecycle, creates windows (`BrowserWindow`), registers IPC handlers, and manages custom protocol for streaming media files.

### 2. Preload Script (`src/preload/`)
Serves as a secure bridge between main process and renderer process. Exposes API through `window.cutflow` with sandbox enabled.

### 3. Renderer Process (`src/renderer/`)
Contains the entire user interface (UI). Uses vanilla TypeScript + CSS (no UI frameworks like React/Vue). UI structure consists of:
- **Topbar** — Menu and application controls
- **Media Panel** — Media asset management (bin, FX, transforms)
- **Preview Panel** — Preview of editing results
- **Inspector Panel** — Configuration of selected clip properties
- **Timeline Panel** — Multi-track timeline for arranging clips


## 📜 NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run application in development mode |
| `npm run build` | Type check then build for production |
| `npm run preview` | Preview production build |
| `npm run start` | Same as `preview` |
| `npm run typecheck` | Run type checking for all processes |
| `npm run typecheck:node` | Type checking for main, preload, and shared |
| `npm run typecheck:web` | Type checking for renderer |
| `npm run test` | Run tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |



## 🎯 Key Features

- [x] Import media assets (video, audio, images)
- [x] Multi-track timeline (video & audio tracks)
- [x] Video, audio, and text clips
- [x] Preview editing results
- [x] Inspector for clip properties (transform, color, etc.)
- [x] Text editor modal for editing text clips
- [x] Save & load projects (`.cutflow.json`)
- [x] Undo / Redo
- [x] Auto-update (electron-updater)
- [ ] Export video (upcoming feature)
- [ ] Multi-sequence (upcoming feature)



## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork this repository
2. Create a new feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: describe your feature"`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

Make sure your code passes type checking and tests before creating a PR.


## 📄 License

This project is licensed under the [MIT License](LICENSE).


## 👨‍💻 Author

**CutFlow** — [alth45/cutflow-video-edit](https://github.com/alth45/cutflow-video-edit)


> *Note: This project is still in active development. Some features may not be available yet or are still experimental.*

### Running Tests

```bash
npm run test         # Run all tests once
npm run test:watch   # Run tests in watch mode
```
