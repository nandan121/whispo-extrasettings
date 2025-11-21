import {
  getWindowRendererHandlers,
  showPanelWindowAndStartRecording,
  stopRecordingAndHidePanelWindow,
  WINDOWS,
} from "./window"
import { systemPreferences } from "electron"
import { configStore } from "./config"
import { state } from "./state"
import { spawn } from "child_process"
import path from "path"
import { clipboard } from "electron"

const rdevPath = path
  .join(
    __dirname,
    `../../resources/bin/whispo-rs${process.env.IS_MAC ? "" : ".exe"}`,
  )
  .replace("app.asar", "app.asar.unpacked")

type RdevEvent = {
  event_type: "KeyPress" | "KeyRelease"
  data: {
    key: "ControlLeft" | "BackSlash" | string
  }
  time: {
    secs_since_epoch: number
  }
}

export const writeText = (text: string) => {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(rdevPath, ["write", text])

    child.stdout.on("data", (data) => {
      console.log(`stdout: ${data}`)
    })

    child.stderr.on("data", (data) => {
      console.error(`stderr: ${data}`)
    })

    child.on("close", (code) => {
      // writeText will trigger KeyPress event of the key A
      // I don't know why
      keysPressed.clear()

      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`child process exited with code ${code}`))
      }
    })
  })
}

export const simulateCopy = () => {
  return new Promise<void>((resolve, reject) => {
    console.log("[CLEANUP] Calling Rust binary for copy simulation")
    const child = spawn(rdevPath, ["copy"])

    //child.stdout.on("data", (data) => {
      //console.log(`[CLEANUP] Rust stdout: ${data}`)
    //})

    child.stderr.on("data", (data) => {
      console.error(`[CLEANUP] Rust stderr: ${data}`)
    })

    child.on("close", (code) => {
      //console.log(`[CLEANUP] Rust process exited with code ${code}`)
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`child process exited with code ${code}`))
      }
    })
  })
}

export const detectSelection = async (): Promise<string | null> => {
  try {
    // 1. Save current clipboard
    const originalText = clipboard.readText()
    const originalImage = clipboard.readImage()
    
    // 2. Set marker
    const marker = `WHISPO_MARKER_${Date.now()}_${Math.random()}`
    clipboard.writeText(marker)
    
    // 3. Simulate Copy
    await simulateCopy()
    
    // 4. Wait a bit for clipboard to update
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // 5. Check clipboard
    const currentText = clipboard.readText()
    
    if (currentText === marker) {
      // No change -> No selection
      // Restore original
      if (!originalImage.isEmpty()) {
        clipboard.writeImage(originalImage)
      } else {
        clipboard.writeText(originalText)
      }
      return null
    } else {
      // Changed -> Text was selected
      return currentText
    }
  } catch (error) {
    console.error("Error detecting selection:", error)
    return null
  }
}

const parseEvent = (event: any) => {
  try {
    const e = JSON.parse(String(event))
    e.data = JSON.parse(e.data)
    return e as RdevEvent
  } catch {
    return null
  }
}

// keys that are currently pressed down without releasing
// excluding ctrl
// when other keys are pressed, pressing ctrl will not start recording
const keysPressed = new Map<string, number>()

const hasRecentKeyPress = () => {
  if (keysPressed.size === 0) return false

  const now = Date.now() / 1000
  return [...keysPressed.values()].some((time) => {
    // 10 seconds
    // for some weird reasons sometime KeyRelease event is missing for some keys
    // so they stay in the map
    // therefore we have to check if the key was pressed in the last 10 seconds
    return now - time < 10
  })
}

export function listenToKeyboardEvents() {
  let isHoldingCtrlKey = false
  let startRecordingTimer: NodeJS.Timeout | undefined
  let isPressedCtrlKey = false
  let isPressedWindowsKey = false
  let isPressedAltKey = false
  let isPressedShiftKey = false
  let isHoldingShortcut = false

  if (process.env.IS_MAC) {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) {
      return
    }
  }

  const cancelRecordingTimer = () => {
    if (startRecordingTimer) {
      clearTimeout(startRecordingTimer)
      startRecordingTimer = undefined
    }
  }

  const handleEvent = (e: RdevEvent) => {
    if (e.event_type === "KeyPress") {
      //console.log("[KEYBOARD] KeyPress:", e.data.key, "Modifiers - Ctrl:", isPressedCtrlKey, "Alt:", isPressedAltKey, "Shift:", isPressedShiftKey)
      if (e.data.key === "ControlLeft") {
        isPressedCtrlKey = true
      } else if (e.data.key === "MetaLeft") {
        isPressedWindowsKey = true
      } else if (e.data.key === "Alt" || e.data.key === "AltGr") {
        isPressedAltKey = true
      } else if (e.data.key === "ShiftLeft" || e.data.key === "ShiftRight") {
        isPressedShiftKey = true
      }

      if (e.data.key === "Escape" && state.isRecording) {
        const win = WINDOWS.get("panel")
        if (win) {
          stopRecordingAndHidePanelWindow()
        }

        return
      }

      // Helper to check if a shortcut matches the current state
      const checkShortcut = (shortcutConfig: string | undefined, currentKey: string) => {
        if (!shortcutConfig) return false

        const parts = shortcutConfig.split("+")
        const requiredModifiers = {
          ctrl: parts.includes("Ctrl"),
          alt: parts.includes("Alt"),
          shift: parts.includes("Shift"),
          win: parts.includes("Win"),
        }

        // Check modifiers
        if (requiredModifiers.ctrl !== isPressedCtrlKey) return false
        if (requiredModifiers.alt !== isPressedAltKey) return false
        if (requiredModifiers.shift !== isPressedShiftKey) return false
        if (requiredModifiers.win !== isPressedWindowsKey) return false

        // Check key
        // The last part is usually the key, unless it's a modifier-only shortcut (which we shouldn't have ideally)
        const targetKey = parts[parts.length - 1]
        
        // Normalize rdev key to match our recorder format
        let normalizedCurrentKey = currentKey
        if (normalizedCurrentKey.startsWith("Key")) normalizedCurrentKey = normalizedCurrentKey.slice(3)
        
        // Handle specific mappings for modifiers
        if (currentKey === "ControlLeft" || currentKey === "ControlRight") normalizedCurrentKey = "Ctrl"
        if (currentKey === "ShiftLeft" || currentKey === "ShiftRight") normalizedCurrentKey = "Shift"
        if (currentKey === "Alt" || currentKey === "AltGr") normalizedCurrentKey = "Alt"
        if (currentKey === "MetaLeft" || currentKey === "MetaRight") normalizedCurrentKey = "Win"

        return normalizedCurrentKey === targetKey
      }

      // Handle cleanup shortcut
      const cleanupShortcut = configStore.get().cleanupShortcut
      const textCleanupEnabled = configStore.get().textCleanupEnabled
      const cleanupMode = configStore.get().cleanupShortcutMode || "toggle"
      
      if (cleanupShortcut && textCleanupEnabled) {
        if (checkShortcut(cleanupShortcut, e.data.key)) {
           //console.log("[CLEANUP] Cleanup triggered")
           if (cleanupMode === "toggle") {
             if (!state.isCleanupRecording) {
                // Start recording logic
                state.isCleanupRecording = true 
                const waitForKeyRelease = () => {
                  if (isPressedAltKey || isPressedShiftKey || isPressedCtrlKey || isPressedWindowsKey) {
                    setTimeout(waitForKeyRelease, 10)
                  } else {
                    detectSelection().then((selection) => {
                      if (selection) {
                        console.log("[CLEANUP] Text selected:", selection.substring(0, 50) + "...")
                        state.isCleanupMode = true
                        state.selectedText = selection
                        state.isCommandMode = false
                        showPanelWindowAndStartRecording()
                      } else {
                        console.log("[CLEANUP] No text selected -> Command Mode")
                        state.isCleanupMode = false
                        state.selectedText = ""
                        state.isCommandMode = true
                        showPanelWindowAndStartRecording()
                      }
                    }).catch((err) => {
                      console.error("[CLEANUP] Selection detection failed:", err)
                      state.isCleanupRecording = false
                    })
                  }
                }
                setTimeout(waitForKeyRelease, 10)
             } else {
                // Stop recording
                console.log("[CLEANUP] Stopping cleanup recording")
                state.isCleanupRecording = false
                getWindowRendererHandlers("panel")?.finishRecording.send()
             }
           } else {
             // HOLD MODE
             if (!state.isCleanupRecording) {
                state.isCleanupRecording = true
                detectSelection().then((selection) => {
                    if (selection) {
                        state.isCleanupMode = true
                        state.selectedText = selection
                        state.isCommandMode = false
                        showPanelWindowAndStartRecording()
                    } else {
                        state.isCleanupMode = false
                        state.selectedText = ""
                        state.isCommandMode = true
                        showPanelWindowAndStartRecording()
                    }
                }).catch(() => {
                    state.isCleanupRecording = false
                })
             }
           }
           return
        }
      }

      const shortcut = configStore.get().shortcut
      const shortcutMode = configStore.get().shortcutMode || "hold"
      
      // Check for custom shortcut
      if (shortcut && shortcut !== "hold-ctrl") {
        if (checkShortcut(shortcut, e.data.key)) {
          if (shortcutMode === "toggle") {
             getWindowRendererHandlers("panel")?.startOrFinishRecording.send()
          } else {
             // Hold mode: Start recording with delay
             // Prevent repeated triggers if already holding or timer running
             if (isHoldingShortcut || startRecordingTimer) {
                 return
             }
             
             if (!state.isRecording) {
                 // console.log("Starting hold timer...")
                 startRecordingTimer = setTimeout(() => {
                     console.log("Hold timer fired, starting recording")
                     isHoldingShortcut = true
                     showPanelWindowAndStartRecording()
                     startRecordingTimer = undefined
                 }, 600)
             }
          }
          return
        }
      }
      
      // Legacy hold-ctrl support
      if (shortcut === "hold-ctrl") {
        if (e.data.key === "ControlLeft") {
          if (hasRecentKeyPress()) {
            return
          }

          if (startRecordingTimer) {
            return
          }

          startRecordingTimer = setTimeout(() => {
            isHoldingCtrlKey = true
            console.log("start recording")
            showPanelWindowAndStartRecording()
          }, 800)
        }
      }
      
    } else if (e.event_type === "KeyRelease") {
      //console.log("[KEYBOARD] KeyRelease:", e.data.key)
      keysPressed.delete(e.data.key)

      if (e.data.key === "ControlLeft") {
        isPressedCtrlKey = false
      } else if (e.data.key === "MetaLeft") {
        isPressedWindowsKey = false
      } else if (e.data.key === "Alt" || e.data.key === "AltGr") {
        isPressedAltKey = false
      } else if (e.data.key === "ShiftLeft" || e.data.key === "ShiftRight") {
        isPressedShiftKey = false
      }

      const shortcut = configStore.get().shortcut
      const shortcutMode = configStore.get().shortcutMode || "hold"
      const cleanupShortcut = configStore.get().cleanupShortcut
      const cleanupShortcutMode = configStore.get().cleanupShortcutMode || "toggle"

      // Check if we need to stop recording in Hold mode
      
      // 1. Recording Shortcut
      if (shortcut && shortcutMode === "hold") {
          // Check if the released key was part of the shortcut
          const parts = shortcut.split("+")
          let releasedKeyMatches = false
          
          // Check modifiers
          if (e.data.key === "ControlLeft" && parts.includes("Ctrl")) releasedKeyMatches = true
          if (e.data.key === "MetaLeft" && parts.includes("Win")) releasedKeyMatches = true
          if ((e.data.key === "Alt" || e.data.key === "AltGr") && parts.includes("Alt")) releasedKeyMatches = true
          if ((e.data.key === "ShiftLeft" || e.data.key === "ShiftRight") && parts.includes("Shift")) releasedKeyMatches = true
          
          // Check main key
          let normalizedReleasedKey = e.data.key
          if (normalizedReleasedKey.startsWith("Key")) normalizedReleasedKey = normalizedReleasedKey.slice(3)
          if (parts.includes(normalizedReleasedKey)) releasedKeyMatches = true
          
          if (releasedKeyMatches) {
              // Cancel timer if it's running (short press)
              if (startRecordingTimer) {
                  console.log("Short press detected, cancelling timer")
                  clearTimeout(startRecordingTimer)
                  startRecordingTimer = undefined
              } else if (isHoldingShortcut) {
                  // Stop recording if it was running and we were holding
                  console.log("Key released, stopping recording")
                  getWindowRendererHandlers("panel")?.finishRecording.send()
                  isHoldingShortcut = false
              }
          }
      }
      
      // 2. Cleanup Shortcut
      if (cleanupShortcut && cleanupShortcutMode === "hold" && state.isRecording && state.isCleanupMode) {
          const parts = cleanupShortcut.split("+")
          let releasedKeyMatches = false
           // Check modifiers
          if (e.data.key === "ControlLeft" && parts.includes("Ctrl")) releasedKeyMatches = true
          if (e.data.key === "MetaLeft" && parts.includes("Win")) releasedKeyMatches = true
          if ((e.data.key === "Alt" || e.data.key === "AltGr") && parts.includes("Alt")) releasedKeyMatches = true
          if ((e.data.key === "ShiftLeft" || e.data.key === "ShiftRight") && parts.includes("Shift")) releasedKeyMatches = true
          
          // Check main key
          let normalizedReleasedKey = e.data.key
          if (normalizedReleasedKey.startsWith("Key")) normalizedReleasedKey = normalizedReleasedKey.slice(3)
          if (parts.includes(normalizedReleasedKey)) releasedKeyMatches = true
          
          if (releasedKeyMatches) {
              console.log("[CLEANUP] Stopping cleanup recording (Hold mode)")
              state.isCleanupRecording = false
              getWindowRendererHandlers("panel")?.finishRecording.send()
          }
      }

      if (shortcut && shortcut !== "hold-ctrl") {
        return
      }

      cancelRecordingTimer()

      if (e.data.key === "ControlLeft") {
        console.log("release ctrl")
        if (isHoldingCtrlKey) {
          getWindowRendererHandlers("panel")?.finishRecording.send()
        } else {
          stopRecordingAndHidePanelWindow()
        }

        isHoldingCtrlKey = false
      }
    }
  }

  const child = spawn(rdevPath, ["listen"], {})

  child.stdout.on("data", (data) => {
    // Comment out noisy key event logging during development
    // if (import.meta.env.DEV) {
    //   console.log(String(data))
    // }

    const event = parseEvent(data)
    if (!event) return

    handleEvent(event)
  })
}
