# AGENTS.MD - Quick Start Guide for AI Agents

## Project Overview

**Whispo** is an AI-powered dictation desktop application built with Electron. It allows users to use their voice to type anywhere, with support for OpenAI, Groq, and Gemini models.

- **Name**: whispo
- **Version**: 0.2.3
- **Description**: AI powered dictation
- **Homepage**: https://whispo.app
- **License**: AGPL-3.0
- **Package Manager**: pnpm@9.12.1

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Radix UI
- **Desktop**: Electron 31, electron-vite
- **Backend/System**: Node.js, Rust (whispo-rs)
- **State Management**: React Query (@tanstack/react-query)
- **IPC**: @egoist/tipc
- **Build Tools**: electron-builder, prettier, eslint, typescript

## Project Structure

Key directories:
- `src/main/` - Electron main process (keyboard shortcuts, IPC, LLM integration)
- `src/renderer/` - React frontend (UI, settings pages, audio recording)
- `src/preload/` - Secure context bridge
- `src/shared/` - Shared TypeScript types
- `whispo-rs/` - Rust native binary for system operations
- `resources/` - App icons and images
- `scripts/` - Build and utility scripts

## Key Files

Core functionality:
- [`src/main/keyboard.ts`](src/main/keyboard.ts) - Global keyboard shortcuts, push-to-talk/toggle modes
- [`src/main/tipc.ts`](src/main/tipc.ts) - IPC channel definitions
- [`src/renderer/src/lib/recorder.ts`](src/renderer/src/lib/recorder.ts) - Audio recording
- [`src/main/llm.ts`](src/main/llm.ts) - LLM API integration (OpenAI, Groq, Gemini)

Settings & config:
- [`src/renderer/src/pages/settings-general.tsx`](src/renderer/src/pages/settings-general.tsx) - Main settings UI
- [`src/renderer/src/pages/settings-transcription.tsx`](src/renderer/src/pages/settings-transcription.tsx) - Language & custom words
- [`src/renderer/src/pages/settings-providers.tsx`](src/renderer/src/pages/settings-providers.tsx) - API provider config
- [`src/renderer/src/pages/settings-commands.tsx`](src/renderer/src/pages/settings-commands.tsx) - Command mode
- [`src/main/config.ts`](src/main/config.ts) - Configuration storage

## Build & Development

```bash
pnpm install
pnpm dev              # Start dev server
pnpm build            # Full build (typecheck + electron-vite + Rust)
pnpm build:win        # Build Windows
pnpm build:mac        # Build macOS
pnpm build:linux      # Build Linux
pnpm lint             # Lint & auto-fix
pnpm format           # Format with Prettier
pnpm typecheck        # Type-check
pnpm build-rs         # Build Rust component only
```

## Important Notes

### Shortcut Compatibility
Command mode with Push-to-Talk fails with multi-modifier shortcuts (Ctrl+Alt+Key). Use `Ctrl+F9` or `Ctrl+[Number]` instead. See README.md for details.

### Custom Words & Romanization
Custom words cause romanization for non-Latin scripts. Use "Auto" language detection for native scripts. Use post-processing prompt for spelling corrections instead.

### Hallucination Filtering
Known hallucinations (e.g., "Thank you") are filtered in `src/main/tipc.ts`. Update this list if needed.

## Architecture

- **Main process** (`src/main/`): Electron lifecycle, global shortcuts, IPC handlers, LLM integration
- **Renderer process** (`src/renderer/`): React UI, audio recording, settings pages
- **Preload** (`src/preload/`): Secure API exposure via context bridge
- **IPC**: Uses `@egoist/tipc` with channels defined in `src/main/tipc.ts`
- **Rust**: `whispo-rs/` provides native binary for system operations

## Configuration Storage

User data directory:
- Windows: `%APPDATA%/whispo/`
- macOS: `~/Library/Application Support/whispo/`
- Linux: `~/.config/whispo/`

Stores API keys, shortcuts, language settings, custom words, command definitions.

## Dependencies

Key runtime: electron, react, react-dom, @egoist/tipc, @google/generative-ai, @tanstack/react-query, dayjs
Build/dev: electron-vite, vite, typescript, tailwindcss, prettier, eslint, electron-builder

## Resources

- GitHub: https://github.com/nandan121/whispo-extrasettings
- Homepage: https://whispo.app
- License: AGPL-3.0
- Version: 0.2.3
