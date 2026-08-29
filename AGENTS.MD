# AGENTS.md - AI Agent Context Guide

> **Version**: 0.2.5 | **License**: AGPL-3.0 | **Package Manager**: pnpm@9.12.1

## Project Identity

- **Name**: whispo
- **Description**: AI-powered dictation desktop application
- **Homepage**: https://whispo.app
- **Repository**: https://github.com/nandan121/whispo-extrasettings

## Technology Stack

| Category | Technologies |
|----------|-------------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Radix UI |
| Desktop | Electron 31, electron-vite, @egoist/electron-panel-window |
| Backend/System | Node.js, Rust (whispo-rs) |
| State Management | React Query (@tanstack/react-query) |
| Routing | react-router-dom |
| IPC | @egoist/tipc |
| Icons | lucide-react, @iconify-json/mingcute |
| Build Tools | electron-builder, prettier, eslint, typescript |

## Project Structure

```
whispo-extrasettings/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # App entry, window creation, tray, shortcuts
│   │   ├── keyboard.ts    # Global keyboard shortcuts via Rust (rdev)
│   │   ├── tipc.ts        # IPC channel definitions & handlers
│   │   ├── llm.ts         # LLM API integration (OpenAI, Groq, Gemini)
│   │   ├── config.ts      # Configuration storage
│   │   ├── window.ts      # Window management (main, panel, setup)
│   │   ├── tray.ts        # System tray integration
│   │   ├── menu.ts        # Application menu
│   │   ├── updater.ts     # Auto-update via electron-updater
│   │   ├── serve.ts       # Custom protocol handler (assets://)
│   │   ├── state.ts       # App state (recording, cleanup, command modes)
│   │   ├── renderer-handlers.ts  # Renderer event handlers
│   │   └── utils.ts       # Accessibility check utility
│   ├── renderer/          # React frontend
│   │   └── src/
│   │       ├── main.tsx   # React entry point
│   │       ├── App.tsx    # App component
│   │       ├── router.tsx # React Router configuration
│   │       ├── components/
│   │       │   ├── app-layout.tsx
│   │       │   ├── setup.tsx
│   │       │   ├── updater.tsx
│   │       │   ├── shortcut-recorder.tsx
│   │       │   └── ui/    # UI components (button, dialog, input, etc.)
│   │       ├── pages/
│   │       │   ├── index.tsx          # Recording history view
│   │       │   ├── panel.tsx          # Recording panel overlay
│   │       │   ├── setup.tsx          # First-time setup (accessibility)
│   │       │   ├── settings.tsx       # Settings layout with nav
│   │       │   ├── settings-general.tsx    # Shortcuts, STT, post-processing
│   │       │   ├── settings-providers.tsx   # API provider config
│   │       │   ├── settings-transcription.tsx  # Language & custom words
│   │       │   ├── settings-commands.tsx    # Command mode config
│   │       │   ├── settings-data.tsx        # Data management
│   │       │   └── settings-about.tsx       # About page
│   │       └── lib/
│   │           ├── recorder.ts    # Audio recording (MediaRecorder)
│   │           ├── sound.ts       # Sound playback
│   │           ├── event-emitter.js # Event emitter (types in event-emitter.d.ts)
│   │           ├── tipc-client.ts # IPC client
│   │           ├── query-client.ts # React Query client
│   │           ├── language-codes.ts # Language code mappings
│   │           └── utils.ts       # Utility functions
│   ├── preload/           # Secure context bridge
│   │   └── index.ts       # Exposes electronAPI via contextBridge
│   └── shared/            # Shared TypeScript types
│       ├── index.ts       # Provider IDs, default prompts
│       └── types.ts       # Config, CommandMapping, RecordingHistoryItem
├── whispo-rs/             # Rust native binary
│   ├── Cargo.toml         # Dependencies: rdev, serde, serde_json, enigo
│   └── main.rs            # Keyboard listening, text writing, copy simulation
├── resources/             # App icons, images, tray icons
├── scripts/               # Build & utility scripts
│   ├── build-rs.sh        # Rust build script
│   ├── release.js         # Release automation
│   └── fix-pnpm-windows.js # pnpm Windows fix
├── electron-builder.config.cjs  # Build configuration
└── electron.vite.config.ts      # Vite configuration for Electron
```

## Build & Development Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server with hot reload
pnpm start            # Preview production build
pnpm build            # Full build (typecheck + electron-vite + Rust)
pnpm build:win        # Build Windows installer
pnpm build:mac        # Build macOS app
pnpm build:linux      # Build Linux app (AppImage, snap, deb)
pnpm build:unpack     # Build unpacked directory
pnpm lint             # Lint & auto-fix with ESLint
pnpm format           # Format with Prettier
pnpm typecheck        # Type-check (node + web)
pnpm build-rs         # Build Rust component only
pnpm release          # Run release script
```

## Architecture Overview

### Main Process (`src/main/`)

| File | Purpose |
|------|---------|
| `index.ts` | App lifecycle, window creation, tray initialization, global shortcuts |
| `keyboard.ts` | Global keyboard shortcuts via Rust binary (rdev), push-to-talk/toggle modes, selection detection |
| `tipc.ts` | IPC channel definitions, recording creation, transcription, command execution |
| `llm.ts` | LLM API integration for post-processing and text cleanup |
| `config.ts` | Configuration storage with defaults |
| `window.ts` | Window management: main window, panel overlay, setup window |
| `tray.ts` | System tray with recording controls |
| `menu.ts` | Application menu bar |
| `updater.ts` | Auto-update via electron-updater (GitHub releases) |
| `serve.ts` | Custom `assets://` protocol for serving recordings and app files |
| `state.ts` | App state: recording, cleanup mode, command mode |
| `renderer-handlers.ts` | Type definitions for main → renderer event handlers |
| `utils.ts` | Accessibility check utility |

### Renderer Process (`src/renderer/`)

| File | Purpose |
|------|---------|
| `main.tsx` | React entry point |
| `router.tsx` | React Router with lazy-loaded routes |
| `pages/index.tsx` | Recording history with search, playback, delete |
| `pages/panel.tsx` | Recording panel overlay UI |
| `pages/setup.tsx` | First-time accessibility permission setup |
| `pages/settings*.tsx` | Settings pages for all configuration |
| `lib/recorder.ts` | Audio recording with MediaRecorder API, visualizer |
| `lib/sound.ts` | Sound playback for recording start/end |

### Rust Binary (`whispo-rs/`)

| Feature | Description |
|---------|-------------|
| `listen` | Global keyboard event listener via rdev |
| `write` | Text typing simulation via enigo |
| `copy` | Copy simulation for selection detection |

### IPC Channels (`@egoist/tipc`)

**Main → Renderer:**
- `refreshRecordingHistory` - Notify history update
- `startRecording` / `finishRecording` / `stopRecording` / `startOrFinishRecording` - Recording control
- `navigate` - Navigate to settings page
- `updateAvailable` - Update notification

**Renderer → Main:**
- `getConfig` / `saveConfig` - Configuration management
- `createRecording` - Process audio recording
- `getRecordingHistory` / `deleteRecordingItem` / `clearHistory` - History management
- `restartApp` / `quitApp` - App lifecycle
- `showPanelWindow` - Show the recording panel window
- `checkForUpdatesAndDownload` / `quitAndInstall` - Updates

## Configuration Storage

**Config File**: `%APPDATA%\app.whispo\config.json` (Windows)
**Recordings**: `%APPDATA%\app.whispo\recordings\`

Config location derived from `appId: "app.whispo"` in `electron-builder.config.cjs`.

### Config Schema (`src/shared/types.ts`)

```typescript
type Config = {
  shortcut?: string              // Recording shortcut (default: "Ctrl+Win")
  shortcutMode?: "hold" | "toggle"  // Push-to-talk or toggle
  cleanupShortcut?: string       // Cleanup/command shortcut (default: "Ctrl+F9")
  cleanupShortcutMode?: "hold" | "toggle"
  hideDockIcon?: boolean         // macOS only

  sttProviderId?: STT_PROVIDER_ID  // "openai" | "groq" | "custom1" | "custom2"

  // Provider settings (OpenAI, Groq, Gemini, Custom1, Custom2)
  {provider}ApiKey?: string
  {provider}BaseUrl?: string
  {provider}SttModel?: string
  {provider}ChatModel?: string

  // Post-processing
  transcriptPostProcessingEnabled?: boolean
  transcriptPostProcessingProviderId?: CHAT_PROVIDER_ID
  transcriptPostProcessingPrompt?: string

  // Text cleanup / Command mode
  textCleanupEnabled?: boolean
  textCleanupProviderId?: CHAT_PROVIDER_ID
  textCleanupPromptTemplate?: string

  // Transcription
  transcriptionLanguage?: string  // Language code or "auto"
  transcriptionPrompt?: string    // Custom words/phrases
  transcriptionPromptEnabled?: boolean

  // Command mappings
  commandMappings?: CommandMapping[]
}
```

## Provider Configuration

### STT Providers (`STT_PROVIDER_ID`)
| ID | Label | Default Model |
|----|-------|---------------|
| `openai` | OpenAI | whisper-1 |
| `groq` | Groq | whisper-large-v3 |
| `custom1` | OpenAI Compat A | (user configured) |
| `custom2` | OpenAI Compat B | (user configured) |

### Chat Providers (`CHAT_PROVIDER_ID`)
| ID | Label | Default Model | API Type |
|----|-------|---------------|----------|
| `openai` | OpenAI | gpt-4o-mini | OpenAI Compatible |
| `groq` | Groq | openai/gpt-oss-120b | OpenAI Compatible |
| `gemini` | Gemini | gemini-flash-lite-latest | Native SDK |
| `custom1` | OpenAI Compat A | google/diffusiongemma-26b-a4b-it | OpenAI Compatible |
| `custom2` | OpenAI Compat B | google/gemma-4-26b-a4b-it:free | OpenAI Compatible |

## Key Features

### 1. Dictation Modes
- **Push-to-Talk (Hold)**: Hold shortcut to record, release to transcribe
- **Toggle**: Press once to start, press again to stop
- **Cancel**: Press `Esc` to cancel recording

### 2. Text Cleanup Mode
- Trigger: Cleanup shortcut with text selected
- Uses LLM to modify selected text based on voice command
- Placeholders: `{selected_text}`, `{command}`

### 3. Command Mode
- Trigger: Cleanup shortcut without text selection
- Prefix-based command matching
- Fallback: URL detection, default command, system command execution

### 4. Recording History
- Stored in `%APPDATA%\app.whispo\recordings\history.json`
- Audio files: `{id}.webm`
- Search, playback, delete functionality

### 5. Auto-Update
- Uses `electron-updater` with GitHub releases
- Custom feed URL: `electron-releases.umida.co`

## Dependencies

### Runtime
| Package | Purpose |
|---------|---------|
| electron | Desktop framework |
| react / react-dom | UI framework |
| @egoist/tipc | IPC communication |
| @google/generative-ai | Gemini API |
| @tanstack/react-query | Server state management |
| dayjs | Date formatting |
| electron-updater | Auto-update |
| react-router-dom | Routing |
| lucide-react | Icons |
| class-variance-authority / clsx / tailwind-merge | CSS utilities |

### Build/Dev
| Package | Purpose |
|---------|---------|
| electron-vite | Electron build tool |
| vite | Build tool |
| @vitejs/plugin-react | React plugin |
| typescript | Type checking |
| tailwindcss | CSS framework |
| prettier | Code formatting |
| eslint | Linting |
| electron-builder | App packaging |

## Important Notes

### Shortcut Compatibility
- **Command Mode + Push-to-Talk**: Multi-modifier shortcuts (Ctrl+Alt+Key) fail to detect selections
- **Recommended**: `Ctrl+F9`, `Ctrl+F10-F12`, `Ctrl+[Number]`
- **Avoid**: `Ctrl+Alt+`, `Ctrl+Shift+`, `Alt+Shift+` combinations

### Custom Words & Romanization
- Custom words (transcriptionPrompt) cause romanization for non-Latin scripts
- Use "Auto" language detection for native scripts
- Use post-processing prompt for spelling corrections instead

### Hallucination Filtering
- Known hallucinations filtered in `src/main/tipc.ts`
- Dual strategy: no_speech_prob threshold (no prompt) vs pattern matching (with prompt)

### Accessibility Permissions
- macOS: Requires accessibility access for keyboard listening
- Windows: No special permissions required
- Setup window shown when accessibility not granted

## Resources

- GitHub: https://github.com/nandan121/whispo-extrasettings
- Homepage: https://whispo.app
- License: AGPL-3.0
- Version: 0.2.5
