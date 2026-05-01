<p align="center">
  <img src="images/icon.png" alt="MD Reader" width="128" height="128">
</p>

<h1 align="center">MD Reader</h1>

<p align="center">
  A lightweight, beautiful desktop Markdown reader with GitHub-style rendering.
  <br>
  <a href="README_zh.md">简体中文</a>
</p>

<p align="center">
  <img src="images/light_mode.png" alt="Light Mode" width="45%">
  &nbsp;&nbsp;
  <img src="images/dark_mode.png" alt="Dark Mode" width="45%">
</p>

## Features

- **GitHub-style Rendering** — Exact same look as GitHub README pages, with GFM tables, task lists, and code blocks
- **Light / Dark / System Theme** — Three theme modes with instant switching; system mode follows your OS preference automatically
- **Drag & Drop** — Just drag `.md` files into the window to open them
- **Multi-tab Sidebar** — Open multiple files and switch between them in the left sidebar
- **Super Lightweight** — ~3.3 MB binary, built with Rust and Tauri
- **Cross-platform** — macOS (ARM64, Intel), Windows (x64), Linux (x64)

## Installation

Download the latest release from the [Releases](https://github.com/yunxuanhao/markdown_reader/releases) page.

| Platform | Package |
|----------|---------|
| macOS | `.dmg` (ARM64 / Intel) |
| Windows | `.msi` / `.exe` |
| Linux | `.deb` / `.AppImage` |

> **macOS users:** Since the app is not notarized, you may see a "damaged" warning. Right-click the app and select **Open**, or run:
> ```bash
> xattr -d com.apple.quarantine /Applications/Markdown\ Reader.app
> ```

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+
- [Rust](https://www.rust-lang.org/) 1.88+

### Quick Start

```bash
# Install dependencies
pnpm install

# Start dev server with hot reload
pnpm tauri dev

# Build for current platform
pnpm build:native
```

### Build Commands

```bash
pnpm build:mac          # macOS ARM64
pnpm build:mac-intel    # macOS Intel
pnpm build:win          # Windows x64
pnpm build:linux        # Linux x64
pnpm build:native       # Auto-detect current platform
pnpm build:all          # All platforms (requires cross-compile setup)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | [Tauri v2](https://v2.tauri.app/) |
| Frontend | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Build Tool | [Vite](https://vitejs.dev/) |
| Markdown Rendering | [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm) |
| Styling | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |

## License

MIT
