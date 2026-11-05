# CutFlow — モジュラー動画エディタ

**CutFlow** は [Electron](https://www.electronjs.org/) と [TypeScript](https://www.typescriptlang.org/) で構築されたモジュラー動画エディタです。タイムライン編集（動画、音声、テキスト）に対応し、メディアビン、プレビュー、インスペクター、タイムラインのパネルベースインターフェースを備えています。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-33.x-blue.svg)](https://www.electronjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-yellow.svg)](https://vitejs.dev/)


## 📋 プロジェクトについて

CutFlow は、以下のことができるデスクトップ動画エディタアプリケーションです：

- メディアアセット（動画、音声、画像）をインポート
- マルチトラックタイムライン（動画＆音声）にクリップを配置
- テキストクリップ（タイトルカード／サード）を追加
- クリップのトリミング、移動、長さ設定
- 編集結果をリアルタイムでプレビュー
- インスペクターでクリップのプロパティを設定（位置、スケール、色、変換）
- `.cutflow.json` 形式でプロジェクトを保存・読み込み
- 元に戻す／やり直し（ヒストリ状態）に対応
- `electron-updater` による自動アップデート



## 🛠️ 技術スタック

| 技術 | バージョン | 用途 |
|------|-----------|------|
| Electron | ^33.2.1 | デスクトップアプリケーションフレームワーク |
| TypeScript | ^5.7.2 | プログラミング言語（strict モード） |
| Vite | ^5.4.0 | ビルドツール & 開発サーバー |
| electron-vite | ^2.3.0 | Electron + Vite 統合 |
| Vitest | ^2.1.8 | ユニットテスト |
| lucide | ^1.68.0 | アイコンライブラリ |
| electron-updater | ^6.3.9 | 自動アップデート |



## 📁 プロジェクト構造

```
cutflow/
├── src/
│   ├── main/                 # Electron メインプロセス
│   ├── preload/              # プリロードスクリプト（メイン ↔ レンダラー間のブリッジ）
│   ├── renderer/             # レンダラープロセス（UI）
│   └── shared/               # メインとレンダラーで共有するコード
├── out/                      # ビルド出力（gitignore 対象）
├── electron.vite.config.ts   # electron-vite 設定
├── tsconfig.json             # TypeScript ルート設定
├── tsconfig.node.json        # Node/メイン用 TypeScript 設定
├── tsconfig.web.json         # ブラウザ／レンダラー用 TypeScript 設定
├── package.json
└── README.md
```


## 🚀 始め方

### 前提条件

以下をインストールしてください：

- [Node.js](https://nodejs.org/)（v18 以上推奨）
- [npm](https://www.npmjs.com/)（Node.js にバンドルされていることが多い）

### インストール

1. このリポジトリをクローン：

```bash
git clone https://github.com/alth45/cutflow-video-edit.git
cd cutflow-video-edit
```

2. 依存関係をインストール：

```bash
npm install
```

### 開発モードで実行

```bash
npm run dev
```

これでホットリロード付きの開発モードでアプリケーションが実行されます。

### 本番用ビルド

```bash
npm run build
```

ビルド出力は `out/` フォルダに保存されます。

### 本番ビルドをプレビュー

```bash
npm run preview
```

### 型チェック

```bash
npm run typecheck
```

または個別に実行：

```bash
npm run typecheck:node   # メイン／プリロード／共有の型チェック
npm run typecheck:web    # レンダラーの型チェック
```

---

## 🏗️ アーキテクチャ

CutFlow は 3 つのプロセスからなる標準的な Electron アーキテクチャを使用しています：

### 1. メインプロセス (`src/main/`)

アプリケーションのライフサイクル、ウィンドウ作成 (`BrowserWindow`)、IPC ハンドラの登録、メディアファイルのストリーミング用カスタムプロトコルの管理を担当します。

### 2. プリロードスクリプト (`src/preload/`)

メインプロセスとレンダラープロセス間の安全なブリッジとして機能します。サンドボックスを有効にした状態で `window.cutflow` 経由で API を公開します。

### 3. レンダラープロセス (`src/renderer/`)

ユーザーインターフェース（UI）全体を含みます。バニラ TypeScript + CSS を使用（React や Vue などの UI フレームワークは不使用）。UI 構造は以下の通り：

- **トップバー** — メニューとアプリケーション操作
- **メディアパネル** — メディアアセット管理（ビン、FX、変換）
- **プレビューパネル** — 編集結果のプレビュー
- **インスペクターパネル** — 選択したクリップのプロパティ設定
- **タイムラインパネル** — マルチトラックタイムラインでクリップを配置

---

## 📜 NPM スクリプト

| コマンド | 説明 |
|----------|------|
| `npm run dev` | 開発モードでアプリケーションを実行 |
| `npm run build` | 型チェックして本番用ビルド |
| `npm run preview` | 本番ビルドをプレビュー |
| `npm run start` | `preview` と同じ |
| `npm run typecheck` | すべてのプロセスで型チェックを実行 |
| `npm run typecheck:node` | メイン、プリロード、共有の型チェック |
| `npm run typecheck:web` | レンダラーの型チェック |
| `npm run test` | Vitest でテストを実行 |
| `npm run test:watch` | 監視モードでテストを実行 |



## 🎯 主な機能

- [x] メディアアセットのインポート（動画、音声、画像）
- [x] マルチトラックタイムライン（動画トラック＆音声トラック）
- [x] 動画、音声、テキストクリップ
- [x] 編集結果のプレビュー
- [x] クリッププロパティのインスペクター（変換、色など）
- [x] テキストクリップ用テキストエディタモーダル
- [x] プロジェクトの保存と読み込み（`.cutflow.json`）
- [x] 元に戻す／やり直し
- [x] 自動アップデート（electron-updater）
- [ ] 動画エクスポート（今後の機能）
- [ ] マルチシーケンス（今後の機能）



## 🤝 コントリビュート

コントリビュートを歓迎します！以下の手順に従ってください：

1. このリポジトリをフォーク
2. 新しいフィーチャーブランチを作成：`git checkout -b feature/フィーチャー名`
3. 変更をコミット：`git commit -m "feat: 機能の説明"`
4. ブランチにプッシュ：`git push origin feature/フィーチャー名`
5. プルリクエストを開く

PR を作成する前に、コードが型チェックとテストを通過していることを確認してください。


## 📄 ライセンス

このプロジェクトは [MIT License](LICENSE) の下でライセンスされています。


## 👨‍💻 著者

**CutFlow** — [alth45/cutflow-video-edit](https://github.com/alth45/cutflow-video-edit)


> *注：このプロジェクトは現在積極的に開発中です。一部の機能はまだ利用できないか、実験的な段階の場合があります。*

### テストを実行

```bash
npm run test         # すべてのテストを一度実行
npm run test:watch   # 監視モードでテストを実行
```
