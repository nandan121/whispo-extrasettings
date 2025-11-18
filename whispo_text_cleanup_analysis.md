# Whispo Text Cleanup Feature - Analysis & Implementation Plan

## Executive Summary

Yes, it is **technically feasible** to add a text cleanup feature to the Whispo application with a separate keyboard shortcut. The **improved workflow approach** (copy first, then shortcut) significantly simplifies implementation and user experience.

## Current System Analysis

### Architecture Overview
- **Technology Stack**: Electron + React + TypeScript
- **Communication**: TIPC (Type-safe IPC) between main and renderer processes
- **Text Input**: Uses `writeText()` function that simulates keyboard input via Rust binary
- **Clipboard**: Uses Electron's clipboard API for text operations
- **Keyboard Handling**: Global keyboard listener via external Rust binary (`whispo-rs`)

### Current Text Flow
1. User triggers dictation shortcut
2. Panel window appears, recording starts
3. Audio captured and sent to STT service
4. Transcript processed and posted (via LLM)
5. Text inserted via clipboard + simulated keyboard input

## Feature Feasibility Assessment

### ✅ **Feasible Components**

1. **New Keyboard Shortcut**: Easy to add as new configuration option
2. **Separate Workflow**: Can implement distinct logic for cleanup vs dictation
3. **Text Processing**: Existing LLM integration can be extended for cleanup
4. **Text Insertion**: Current `writeText()` mechanism works for cleaned text

### ⚠️ **Architectural Challenges**

1. **Text Selection Access**: Electron apps cannot directly access selected text in other applications
2. **Workflow Integration**: Need to adapt existing dictation flow for cleanup mode
3. **User Experience**: Requires clear distinction between dictation and cleanup modes

## Proposed Solution Architecture

### Option 1: Copy-First Workflow (RECOMMENDED - IMPROVED)
**User Flow:**
1. User selects/highlights text in any application
2. User copies text (Ctrl+C)
3. User presses the cleanup shortcut (e.g., `Ctrl+Shift+C`)
4. App immediately captures and processes clipboard content
5. Cleaned text replaces original text

**Advantages:**
- ✅ Works across all platforms and applications
- ✅ Reliable text capture
- ✅ **Streamlined user experience** - no prompts needed
- ✅ No permission issues
- ✅ **Much simpler implementation** - no UI prompts required

**Disadvantages:**
- ⚠️ User must remember the workflow order (copy first, then shortcut)
- ⚠️ Requires slight change in user behavior

### Option 2: Shortcut-First Workflow (Original)
**User Flow:**
1. User selects/highlights text in any application
2. User presses the cleanup shortcut (e.g., `Ctrl+Shift+C`)
3. App prompts user to copy the text
4. User copies text (Ctrl+C)
5. App captures clipboard content and processes it
6. Cleaned text replaces original text

**Advantages:**
- ✅ Works across all platforms and applications
- ✅ Reliable text capture
- ✅ Clear user workflow
- ✅ No permission issues

**Disadvantages:**
- ⚠️ Requires extra user step (copy action)

### Option 2: Accessibility API (macOS Only)
**User Flow:**
1. User selects/highlights text
2. User presses cleanup shortcut
3. App uses macOS Accessibility API to get selected text
4. Text processed and replaced

**Advantages:**
- ✅ One-step process
- ✅ No copy action needed

**Disadvantages:**
- ❌ macOS only
- ❌ Requires accessibility permissions
- ❌ Limited text detection reliability

### Option 3: Clipboard Monitoring
**User Flow:**
1. User selects/highlights text
2. User presses cleanup shortcut
3. App monitors clipboard for change
4. User copies text (Ctrl+C)
5. App processes clipboard content

**Advantages:**
- ✅ Works on all platforms
- ✅ One less UI prompt

**Disadvantages:**
- ⚠️ Requires copy action
- ⚠️ Potential conflicts with other clipboard uses

## Detailed Implementation Plan

### Phase 1: Configuration Extension
**Files to Modify:**
- `src/shared/types.ts`: Add new shortcut option
- `src/main/config.ts`: Extend configuration handling
- `src/renderer/src/pages/settings-general.tsx`: Add UI for cleanup shortcut

**Changes Required:**
```typescript
// src/shared/types.ts
type Config = {
  // ... existing properties
  shortcut?: "hold-ctrl" | "ctrl-slash" | "ctrl-windows" | "ctrl-alt"
  cleanupShortcut?: string  // New property
  // ...
}
```

### Phase 2: Keyboard Handler Extension
**Files to Modify:**
- `src/main/keyboard.ts`: Add cleanup shortcut handling
- `src/main/tipc.ts`: Add cleanup procedure

**New Logic:**
1. Detect cleanup shortcut press
2. Trigger cleanup mode instead of dictation
3. Handle clipboard text processing

### Phase 3: Cleanup Workflow Implementation
**Files to Create/Modify:**
- `src/main/cleanup.ts`: New file for cleanup logic
- `src/main/tipc.ts`: Add cleanup procedure
- `src/renderer/src/components/cleanup-panel.tsx`: New component

**Cleanup Process:**
1. Prompt user to copy text
2. Monitor clipboard
3. Process text via LLM
4. Replace original text

### Phase 4: LLM Integration for Cleanup
**Files to Modify:**
- `src/main/llm.ts`: Extend for cleanup mode
- `src/main/tipc.ts`: Update createRecording procedure

**Cleanup Prompts:**
- Use different prompts for cleanup vs dictation
- Provide instructions for text improvement

## Technical Implementation Details

### 1. Keyboard Shortcut Detection (Simplified)
```typescript
// Add to src/main/keyboard.ts
const cleanupShortcut = configStore.get().cleanupShortcut
if (cleanupShortcut && e.data.key === cleanupShortcut) {
  // Directly capture clipboard and process (no UI prompt needed)
  const clipboardText = clipboard.readText()
  if (clipboardText) {
    // Process text immediately
    getWindowRendererHandlers("panel")?.processCleanup.send(clipboardText)
  }
}
```

### 2. Simplified Clipboard Processing
```typescript
// Add to src/main/tipc.ts
processCleanupFromClipboard: t.procedure.action(async () => {
  const clipboardText = clipboard.readText()
  if (!clipboardText.trim()) {
    throw new Error("No text found in clipboard. Copy text first, then press cleanup shortcut.")
  }
  
  // Process clipboard text with LLM
  const cleanedText = await processTextWithLLM(clipboardText)
  
  // Replace clipboard with cleaned text
  clipboard.writeText(cleanedText)
  
  // Use existing writeText mechanism to paste
  if (isAccessibilityGranted()) {
    await writeText(cleanedText)
  }
})
```

### 3. Minimal UI Changes
- Panel window shows cleanup progress briefly
- Error handling for empty clipboard
- Success/failure feedback
- Optional: Hide panel window for cleaner experience

## Recommended Cleanup Shortcuts

**Options to consider:**
- `Ctrl+Shift+C` (Windows/Linux) / `Cmd+Shift+C` (macOS)
- `Ctrl+Alt+C` / `Cmd+Alt+C`
- `Ctrl+Backslash` / `Cmd+Backslash`

**Recommendation**: `Ctrl+Shift+C` as it's commonly associated with "copy" and provides good discoverability.

## Limitations & Considerations

1. **Cross-Application Limitations**: Cannot directly access selected text in other apps
2. **Permission Requirements**: May need additional accessibility permissions on macOS
3. **User Workflow Change**: Requires users to adapt to copy-paste workflow
4. **Performance**: Text processing should be non-blocking
5. **Error Handling**: Need robust handling for various text formats

## Conclusion

The text cleanup feature is **technically feasible** with significantly simplified implementation using the **Copy-First Workflow (Option 1)**. This approach:

- ✅ **Eliminates UI complexity** - no prompts or complex UI states
- ✅ **Simplifies implementation** - direct clipboard access and processing
- ✅ **Provides smooth user experience** - copy text, press shortcut, done
- ✅ **Maintains reliability** - works across all platforms and applications

The implementation will require modifications to approximately 6-8 files across the codebase, with most changes concentrated in the keyboard handling and text processing logic.

**Workflow: Copy First, Then Shortcut**
1. User copies text (Ctrl+C) ✅
2. User presses cleanup shortcut (Ctrl+Shift+C) ✅
3. App processes clipboard immediately ✅
4. Cleaned text automatically replaces original ✅

**Next Steps:**
1. **Implement copy-first workflow** (recommended: most efficient approach)
2. Add cleanup shortcut to configuration
3. Implement direct clipboard processing
4. Add minimal cleanup UI/feedback
5. Test across different platforms and applications