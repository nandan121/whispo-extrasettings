import {
  getWindowRendererHandlers,
  showPanelWindowAndStartRecording,
  stopRecordingAndHidePanelWindow,
  WINDOWS,
} from "./window"
import { systemPreferences } from "electron"
import { configStore } from "./config"
import { state } from "./state"
import { spawn, ChildProcess } from "child_process"
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

    const timeout = setTimeout(() => {
        child.kill()
        reject(new Error("Copy simulation timed out"))
    }, 2000)

    child.stderr.on("data", (data) => {
      console.error(`[CLEANUP] Rust stderr: ${data}`)
    })

    child.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`child process exited with code ${code}`))
      }
    })
  })
}

export const detectSelection = async (): Promise<string | null> => {
  state.isDetectingSelection = true
  try {
    const originalText = clipboard.readText()
    const originalImage = clipboard.readImage()

    const marker = `WHISPO_MARKER_${Date.now()}_${Math.random()}`
    clipboard.writeText(marker)

    await simulateCopy()

    await new Promise(resolve => setTimeout(resolve, 200))

    const currentText = clipboard.readText()

    if (currentText === marker) {
      if (!originalImage.isEmpty()) {
        clipboard.writeImage(originalImage)
      } else {
        clipboard.writeText(originalText)
      }
      return null
    } else {
      return currentText
    }
  } catch (error) {
    console.error("Error detecting selection:", error)
    return null
  } finally {
    setTimeout(() => {
        state.isDetectingSelection = false
    }, 100)
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

const keysPressed = new Map<string, number>()

const hasRecentKeyPress = () => {
  if (keysPressed.size === 0) return false

  const now = Date.now() / 1000
  return [...keysPressed.values()].some((time) => {
    return now - time < 10
  })
}

let listenerChild: ChildProcess | null = null
let listenerRestartTimer: NodeJS.Timeout | undefined
let isShuttingDown = false

export function stopKeyboardListener() {
  isShuttingDown = true
  if (listenerRestartTimer) {
    clearTimeout(listenerRestartTimer)
    listenerRestartTimer = undefined
  }
  if (listenerChild) {
    listenerChild.kill()
    listenerChild = null
  }
}

export function listenToKeyboardEvents() {
  let isHoldingCtrlKey = false
  let startRecordingTimer: NodeJS.Timeout | undefined
  let startCleanupRecordingTimer: NodeJS.Timeout | undefined
  let isPressedCtrlKey = false
  let isPressedWindowsKey = false
  let isPressedAltKey = false
  let isPressedShiftKey = false
  let isHoldingShortcut = false
  let isHoldingCleanupShortcut = false

  if (process.env.IS_MAC) {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) {
      return
    }
  }

  // Periodically reset modifier key states to prevent them getting stuck.
  // If no key event has been received for 5 seconds, assume all modifiers are released.
  let lastEventTime = Date.now()
  const stuckKeyResetInterval = setInterval(() => {
    const timeSinceLastEvent = Date.now() - lastEventTime
    if (timeSinceLastEvent > 5000) {
      if (isPressedCtrlKey || isPressedWindowsKey || isPressedAltKey || isPressedShiftKey) {
        console.log("[KEYBOARD] Resetting stuck modifier keys (no events for 5s)")
        isPressedCtrlKey = false
        isPressedWindowsKey = false
        isPressedAltKey = false
        isPressedShiftKey = false
      }
    }
  }, 2000)

  const handleEvent = (e: RdevEvent) => {
    lastEventTime = Date.now()

    if (e.event_type === "KeyPress") {
      if (
        e.data.key === "ControlLeft" ||
        e.data.key === "ControlRight"
      ) {
        isPressedCtrlKey = true
      } else if (
        e.data.key === "MetaLeft" ||
        e.data.key === "MetaRight"
      ) {
        isPressedWindowsKey = true
      } else if (e.data.key === "Alt" || e.data.key === "AltGr") {
        isPressedAltKey = true
      } else if (e.data.key === "ShiftLeft" || e.data.key === "ShiftRight") {
        isPressedShiftKey = true
      }

      if (e.data.key === "Escape") {
        const win = WINDOWS.get("panel")
        if (win) {
          stopRecordingAndHidePanelWindow()
        }
        state.isCleanupRecording = false
        state.isCleanupMode = false
        state.isCommandMode = false
        isHoldingCleanupShortcut = false
        state.selectedText = ""
        startCleanupRecordingTimer = undefined
        startRecordingTimer = undefined
        state.isDetectingSelection = false

        return
      }

      const checkShortcut = (shortcutConfig: string | undefined, currentKey: string) => {
        if (!shortcutConfig) return false

        const parts = shortcutConfig.split("+")
        const requiredModifiers = {
          ctrl: parts.includes("Ctrl"),
          alt: parts.includes("Alt"),
          shift: parts.includes("Shift"),
          win: parts.includes("Win"),
        }

        if (requiredModifiers.ctrl !== isPressedCtrlKey) return false
        if (requiredModifiers.alt !== isPressedAltKey) return false
        if (requiredModifiers.shift !== isPressedShiftKey) return false
        if (requiredModifiers.win !== isPressedWindowsKey) return false

        const targetKey = parts[parts.length - 1]

        let normalizedCurrentKey = currentKey
        if (normalizedCurrentKey.startsWith("Key")) normalizedCurrentKey = normalizedCurrentKey.slice(3)
        if (normalizedCurrentKey.startsWith("Digit")) normalizedCurrentKey = normalizedCurrentKey.slice(5)
        if (normalizedCurrentKey.startsWith("Num") && !normalizedCurrentKey.startsWith("NumLock")) normalizedCurrentKey = normalizedCurrentKey.slice(3)
        if (normalizedCurrentKey.startsWith("Kp")) normalizedCurrentKey = normalizedCurrentKey.slice(2)

        if (currentKey === "ControlLeft" || currentKey === "ControlRight") normalizedCurrentKey = "Ctrl"
        if (currentKey === "ShiftLeft" || currentKey === "ShiftRight") normalizedCurrentKey = "Shift"
        if (currentKey === "Alt" || currentKey === "AltGr") normalizedCurrentKey = "Alt"
        if (currentKey === "MetaLeft" || currentKey === "MetaRight") normalizedCurrentKey = "Win"

        return normalizedCurrentKey === targetKey
      }

      const cleanupShortcut = configStore.get().cleanupShortcut
      const textCleanupEnabled = configStore.get().textCleanupEnabled
      const cleanupMode = configStore.get().cleanupShortcutMode || "toggle"

      if (cleanupShortcut && textCleanupEnabled) {
        if (checkShortcut(cleanupShortcut, e.data.key)) {
           if (cleanupMode === "toggle") {
             if (!state.isCleanupRecording) {
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
                console.log("[CLEANUP] Stopping cleanup recording")
                state.isCleanupRecording = false
                getWindowRendererHandlers("panel")?.finishRecording.send()
             }
           } else {
             if (isHoldingCleanupShortcut || startCleanupRecordingTimer) {
                return
             }

             if (!state.isRecording) {
                console.log("[CLEANUP] Starting hold timer...")
                startCleanupRecordingTimer = setTimeout(() => {
                  console.log("[CLEANUP] Hold timer fired, detecting selection and starting recording")
                  isHoldingCleanupShortcut = true
                  state.isCleanupRecording = true

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
                    isHoldingCleanupShortcut = false
                  })

                  startCleanupRecordingTimer = undefined
                }, 300)
             }
           }
           return
        }
      }

      const shortcut = configStore.get().shortcut
      const shortcutMode = configStore.get().shortcutMode || "hold"

      if (shortcut) {
        if (checkShortcut(shortcut, e.data.key)) {
          if (shortcutMode === "toggle") {
             getWindowRendererHandlers("panel")?.startOrFinishRecording.send()
          } else {
             if (isHoldingShortcut || startRecordingTimer) {
                 return
             }

             if (!state.isRecording) {
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

    } else if (e.event_type === "KeyRelease") {
      if (state.isDetectingSelection) {
          return
      }

      keysPressed.delete(e.data.key)

      if (
        e.data.key === "ControlLeft" ||
        e.data.key === "ControlRight"
      ) {
        isPressedCtrlKey = false
      } else if (
        e.data.key === "MetaLeft" ||
        e.data.key === "MetaRight"
      ) {
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

      if (shortcut && shortcutMode === "hold") {
          const parts = shortcut.split("+")
          let releasedKeyMatches = false

          if ((e.data.key === "ControlLeft" || e.data.key === "ControlRight") && parts.includes("Ctrl")) releasedKeyMatches = true
          if ((e.data.key === "MetaLeft" || e.data.key === "MetaRight") && parts.includes("Win")) releasedKeyMatches = true
          if ((e.data.key === "Alt" || e.data.key === "AltGr") && parts.includes("Alt")) releasedKeyMatches = true
          if ((e.data.key === "ShiftLeft" || e.data.key === "ShiftRight") && parts.includes("Shift")) releasedKeyMatches = true

          let normalizedReleasedKey = e.data.key
          if (normalizedReleasedKey.startsWith("Key")) normalizedReleasedKey = normalizedReleasedKey.slice(3)
          if (parts.includes(normalizedReleasedKey)) releasedKeyMatches = true

          if (releasedKeyMatches) {
              if (startRecordingTimer) {
                  console.log("Short press detected, cancelling timer")
                  clearTimeout(startRecordingTimer)
                  startRecordingTimer = undefined
              } else if (isHoldingShortcut) {
                  console.log("Key released, stopping recording")
                  getWindowRendererHandlers("panel")?.finishRecording.send()
                  isHoldingShortcut = false
              }
          }
      }

      if (cleanupShortcut && cleanupShortcutMode === "hold") {
          const parts = cleanupShortcut.split("+")
          let releasedKeyMatches = false
          if ((e.data.key === "ControlLeft" || e.data.key === "ControlRight") && parts.includes("Ctrl")) releasedKeyMatches = true
          if ((e.data.key === "MetaLeft" || e.data.key === "MetaRight") && parts.includes("Win")) releasedKeyMatches = true
          if ((e.data.key === "Alt" || e.data.key === "AltGr") && parts.includes("Alt")) releasedKeyMatches = true
          if ((e.data.key === "ShiftLeft" || e.data.key === "ShiftRight") && parts.includes("Shift")) releasedKeyMatches = true

          let normalizedReleasedKey = e.data.key
          if (normalizedReleasedKey.startsWith("Key")) normalizedReleasedKey = normalizedReleasedKey.slice(3)
          if (parts.includes(normalizedReleasedKey)) releasedKeyMatches = true

          if (releasedKeyMatches) {
              if (startCleanupRecordingTimer) {
                  console.log("[CLEANUP] Short press detected, cancelling timer")
                  clearTimeout(startCleanupRecordingTimer)
                  startCleanupRecordingTimer = undefined
              } else if (isHoldingCleanupShortcut) {
                  console.log("[CLEANUP] Key released, stopping recording")
                  state.isCleanupRecording = false
                  getWindowRendererHandlers("panel")?.finishRecording.send()
                  isHoldingCleanupShortcut = false
              }
          }
      }
    }
  }

  const startListener = () => {
    if (isShuttingDown) return

    console.log("[KEYBOARD] Starting Rust listener process")
    const child = spawn(rdevPath, ["listen"], {})
    listenerChild = child

    let lastDataTime = Date.now()

    child.stdout.on("data", (data) => {
      lastDataTime = Date.now()
      const event = parseEvent(data)
      if (!event) return
      handleEvent(event)
    })

    child.stderr.on("data", (data) => {
      console.error(`[KEYBOARD] Rust stderr: ${data}`)
    })

    child.on("close", (code, signal) => {
      listenerChild = null
      clearInterval(stuckKeyResetInterval)

      if (isShuttingDown) {
        console.log("[KEYBOARD] Listener stopped (app shutdown)")
        return
      }

      console.log(`[KEYBOARD] Listener process exited (code=${code}, signal=${signal}), restarting in 1s...`)

      // Reset modifier states on crash to prevent stuck keys
      isPressedCtrlKey = false
      isPressedWindowsKey = false
      isPressedAltKey = false
      isPressedShiftKey = false
      isHoldingShortcut = false
      isHoldingCleanupShortcut = false

      listenerRestartTimer = setTimeout(() => {
        listenerRestartTimer = undefined
        startListener()
      }, 1000)
    })

    child.on("error", (err) => {
      console.error("[KEYBOARD] Failed to start listener:", err)
      listenerChild = null

      if (!isShuttingDown) {
        listenerRestartTimer = setTimeout(() => {
          listenerRestartTimer = undefined
          startListener()
        }, 3000)
      }
    })

    // Health check: if no events received for 30 seconds while not recording, restart
    const healthCheckInterval = setInterval(() => {
      if (isShuttingDown) {
        clearInterval(healthCheckInterval)
        return
      }
      if (!listenerChild) {
        clearInterval(healthCheckInterval)
        return
      }
      const timeSinceLastData = Date.now() - lastDataTime
      if (timeSinceLastData > 30000 && !state.isRecording) {
        console.log("[KEYBOARD] Health check: no events for 30s, restarting listener")
        child.kill()
        clearInterval(healthCheckInterval)
      }
    }, 10000)
  }

  isShuttingDown = false
  startListener()
}
