# CutFlow — Modular Video Editor

**CutFlow** adalah video editor modular berbasis [Electron](https://www.electronjs.org/) dan [TypeScript](https://www.typescriptlang.org/). Dirancang untuk editing timeline (video, audio, teks) dengan antarmuka berbagi panel: media bin, preview, inspector, dan timeline.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-33.x-blue.svg)](https://www.electronjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-yellow.svg)](https://vitejs.dev/)

---

## 📋 Tentang Proyek

CutFlow adalah aplikasi desktop video editor yang memungkinkan pengguna untuk:

- Mengimpor aset media (video, audio, gambar)
- Mengatur klip di timeline multi-track (video & audio)
- Menambahkan klip teks (title card / lower-third)
- Memotong, memindahkan, dan mengatur durasi klip
- Melihat preview hasil editing secara real-time
- Mengatur properti klip via inspector (posisi, skala, warna, transform)
- Menyimpan dan memuat project dalam format `.cutflow.json`
- Dukungan undo/redo (history state)
- Auto-update melalui `electron-updater`


---

## 🛠️ Stack Teknologi

| Teknologi | Versi | Penggunaan |
|-----------|-------|------------|
| Electron | ^33.2.1 | Framework desktop aplikasi |
| TypeScript | ^5.7.2 | Bahasa pemrograman (strict mode) |
| Vite | ^5.4.0 | Build tool & dev server |
| electron-vite | ^2.3.0 | Integrasi Electron + Vite |
| Vitest | ^2.1.8 | Unit testing |
| lucide | ^1.68.0 | Icon library |
| electron-updater | ^6.3.9 | Auto-update |

---

## 📁 Struktur Proyek

```
cutflow/
├── src/
│   ├── main/                         # Electron main process
│   │   ├── index.ts                  # Entry point (app lifecycle, window)
│   │   ├── media-protocol.ts         # Custom protocol untuk streaming file media
│   │   ├── window.ts                 # Manajemen BrowserWindow
│   │   └── ipc/                      # Handler IPC (Inter-Process Communication)
│   │       ├── index.ts              # Pendaftaran channel IPC
│   │       ├── export.ipc.ts         # Handler export
│   │       ├── media.ipc.ts          # Handler media
│   │       └── project.ipc.ts        # Handler project
│   ├── preload/                      # Preload script (bridge main ↔ renderer)
│   │   ├── api.ts                    # API yang diexpose via window.cutflow
│   │   └── index.ts                  # Entry point preload
│   ├── renderer/                     # Renderer process (UI)
│   │   ├── index.html                # Entry HTML
│   │   ├── main.ts                   # Entry point renderer
│   │   ├── window.d.ts               # Deklarasi tipe window
│   │   ├── app/                      # Shell aplikasi
│   │   │   ├── App.ts                # Root component aplikasi
│   │   │   ├── bootstrap.ts          # Bootstrap aplikasi
│   │   │   └── flows.ts              # Alur/routing aplikasi
│   │   ├── core/                     # Utilitas inti
│   │   │   ├── dialog.ts             # Utilitas dialog
│   │   │   ├── Dom.ts                # Helper DOM
│   │   │   ├── dropdown.ts           # Komponen dropdown
│   │   │   ├── EventBus.ts           # Event bus
│   │   │   ├── events.ts             # Konstanta event
│   │   │   ├── icons.ts              # Definisi ikon
│   │   │   ├── IpcClient.ts          # Wrapper client IPC
│   │   │   └── Store.ts              # State store
│   │   ├── modules/                  # Modul fitur
│   │   │   ├── animations/           # Definisi animasi
│   │   │   ├── effects/              # Efek video
│   │   │   ├── export/               # Modul export
│   │   │   ├── inspector/            # Panel inspector
│   │   │   ├── keyboard/             # Shortcut keyboard
│   │   │   ├── keyframes/            # Animasi keyframe
│   │   │   ├── media/                # Manajemen media
│   │   │   ├── preview/              # Preview video
│   │   │   ├── text-editor/          # Editor teks
│   │   │   ├── timeline/             # Panel timeline
│   │   │   └── topbar/               # Top bar
│   │   ├── state/                    # Manajemen state
│   │   │   ├── appStore.ts           # Store utama
│   │   │   ├── clipboard.ts          # State clipboard
│   │   │   ├── demo.ts               # Data demo
│   │   │   ├── project-serializer.ts # Serialisasi project
│   │   │   ├── selectors.ts          # Selector state
│   │   │   └── actions/              # Aksi state (Redux-like)
│   │   │       ├── clip-effect.actions.ts
│   │   │       ├── clip-keyframe.actions.ts
│   │   │       ├── clip-properties.actions.ts
│   │   │       ├── clip.actions.ts
│   │   │       ├── clipboard.actions.ts
│   │   │       ├── helpers.ts
│   │   │       ├── index.ts
│   │   │       ├── media.actions.ts
│   │   │       ├── playback.actions.ts
│   │   │       ├── project.actions.ts
│   │   │       ├── selection.actions.ts
│   │   │       ├── text.actions.ts
│   │   │       ├── track.actions.ts
│   │   │       ├── transition.actions.ts
│   │   │       └── ui.actions.ts
│   │   ├── styles/                   # Gaya CSS
│   │   │   ├── layout.css
│   │   │   ├── main.css
│   │   │   ├── reset.css
│   │   │   ├── tokens.css
│   │   │   └── components/           # Gaya komponen
│   │   │       ├── animations.css
│   │   │       ├── dialog.css
│   │   │       ├── export-modal.css
│   │   │       ├── inspector.css
│   │   │       ├── media.css
│   │   │       ├── preview.css
│   │   │       ├── text-editor.css
│   │   │       ├── timeline.css
│   │   │       ├── toast.css
│   │   │       └── topbar.css
│   │   └── utils/                    # Utilitas
│   │       ├── id.ts                 # Generator ID
│   │       └── media-url.ts          # Helper URL media
│   └── shared/                       # Kode shared antara main & renderer
│       ├── constants.ts              # Konstanta aplikasi
│       ├── ipc-channels.ts           # Definisi channel IPC
│       └── types/                    # TypeScript types
│           ├── api.ts                # Tipe API
│           ├── project.ts            # Tipe project
│           ├── state.ts              # Tipe state
│           └── timeline.ts           # Tipe timeline
├── out/                              # Build output (di-gitignore)
├── electron.vite.config.ts           # Konfigurasi electron-vite
├── tsconfig.json                     # TypeScript root config
├── tsconfig.node.json                # TypeScript config untuk Node/main
├── tsconfig.web.json                 # TypeScript config untuk browser/renderer
├── package.json
├── package-lock.json
└── README.md
```

---

## 🚀 Memulai (Getting Started)

### Prasyarat

Pastikan Anda telah menginstall:

- [Node.js](https://nodejs.org/) (disarankan v18 atau lebih baru)
- [npm](https://www.npmjs.com/) (biasanya sudah bundled dengan Node.js)

### Instalasi

1. Clone repository ini:

```bash
git clone https://github.com/alth45/cutflow-video-edit.git
cd cutflow-video-edit
```

2. Install dependencies:

```bash
npm install
```

### Menjalankan dalam Mode Development

```bash
npm run dev
```

Perintah ini akan menjalankan aplikasi dalam mode development dengan hot-reload.

### Build untuk Produksi

```bash
npm run build
```

Hasil build akan tersimpan di folder `out/`.

### Preview Build Produksi

```bash
npm run preview
```

### Type Checking

```bash
npm run typecheck
```

ATAU secara terpisah:

```bash
npm run typecheck:node   # Cek tipe main/preload/shared
npm run typecheck:web    # Cek tipe renderer
```

### Menjalankan Test

```bash
npm run test         # Jalankan semua test sekali
npm run test:watch   # Jalankan test dalam mode watch
```

## 🏗️ Arsitektur

CutFlow menggunakan arsitektur Electron standar dengan tiga proses:

### 1. Main Process (`src/main/`)
Menangani siklus hidup aplikasi, membuat jendela (`BrowserWindow`), mendaftarkan handler IPC, dan mengelola custom protocol untuk streaming file media.

### 2. Preload Script (`src/preload/`)
Berfungsi sebagai jembatan aman antara main process dan renderer process. Mengexpose API melalui `window.cutflow` dengan sandbox yang diaktifkan.

### 3. Renderer Process (`src/renderer/`)
Berisi seluruh antarmuka pengguna (UI). Menggunakan vanilla TypeScript + CSS (tidak menggunakan framework UI seperti React/Vue). Struktur UI terdiri dari:
- **Topbar** — Menu dan kontrol aplikasi
- **Media Panel** — Pengelolaan aset media (bin, FX, transformasi)
- **Preview Panel** — Preview video hasil editing
- **Inspector Panel** — Pengaturan properti klip yang dipilih
- **Timeline Panel** — Timeline multi-track untuk menyusun klip

---

## 📜 Skrip NPM

| Perintah | Deskripsi |
|----------|-----------|
| `npm run dev` | Jalankan aplikasi dalam mode development |
| `npm run build` | Type check lalu build untuk produksi |
| `npm run preview` | Preview hasil build produksi |
| `npm run start` | Sama dengan `preview` |
| `npm run typecheck` | Jalankan type checking untuk semua proses |
| `npm run typecheck:node` | Type checking main, preload, dan shared |
| `npm run typecheck:web` | Type checking renderer |
| `npm run test` | Jalankan test dengan Vitest |
| `npm run test:watch` | Jalankan test dalam mode watch |

---

## 🎯 Fitur Utama

- [x] Impor aset media (video, audio, gambar)
- [x] Timeline multi-track (track video dan audio)
- [x] Klip video, audio, dan teks
- [x] Preview hasil editing
- [x] Inspector untuk properti klip (transform, warna, dsb)
- [x] Text editor modal untuk editing klip teks
- [x] Simpan & muat project (`.cutflow.json`)
- [x] Undo / Redo
- [x] Auto-update (electron-updater)
- [ ] Export video (fitur mendatang)
- [ ] Multi-sequence (fitur mendatang)

---

## 🤝 Kontribusi

Kontribusi sangat diterima! Silakan ikuti langkah berikut:

1. Fork repository ini
2. Buat branch fitur baru: `git checkout -b fitur/nama-fitur`
3. Commit perubahan Anda: `git commit -m "feat: deskripsi fitur"`
4. Push ke branch: `git push origin fitur/nama-fitur`
5. Buka Pull Request

Pastikan kode Anda lulus type checking dan test sebelum membuat PR.

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).

---

## 👨‍💻 Author

**CutFlow** — [alth45/cutflow-video-edit](https://github.com/alth45/cutflow-video-edit)

---

> *Catatan: Proyek ini masih dalam tahap pengembangan aktif. Beberapa fitur mungkin belum tersedia atau masih dalam tahap eksperimental.*