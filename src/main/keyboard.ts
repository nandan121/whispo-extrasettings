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

      // Handle cleanup shortcut
      const cleanupShortcut = configStore.get().cleanupShortcut
      const textCleanupEnabled = configStore.get().textCleanupEnabled
      //console.log("[CLEANUP] Config shortcut:", cleanupShortcut)
      if (cleanupShortcut && textCleanupEnabled) {
        let cleanupTriggered = false

        if (cleanupShortcut === "ctrl-shift-c" && e.data.key === "KeyC" && isPressedCtrlKey && isPressedShiftKey) {
          cleanupTriggered = true
          //console.log("[CLEANUP] Ctrl+Shift+C triggered")
        } else if (cleanupShortcut === "ctrl-alt-c" && e.data.key === "KeyC" && isPressedCtrlKey && isPressedAltKey) {
          cleanupTriggered = true
          //console.log("[CLEANUP] Ctrl+Alt+C triggered")
        } else if (cleanupShortcut === "alt-shift-c" && e.data.key === "KeyC" && isPressedAltKey && isPressedShiftKey) {
          cleanupTriggered = true
          //console.log("[CLEANUP] Alt+Shift+C triggered")
        }

        if (cleanupTriggered) {
          //console.log("[CLEANUP] isCleanupRecording:", state.isCleanupRecording)
          if (!state.isCleanupRecording) {
            // First press: capture text and start recording
            //console.log("[CLEANUP] Starting cleanup recording - will wait for key release before copy")
            state.isCleanupRecording = true // Set flag immediately to prevent multiple triggers

            // Wait for all modifier keys to be released before simulating copy
            const waitForKeyRelease = () => {
              if (isPressedAltKey || isPressedShiftKey || isPressedCtrlKey) {
                // Keys still pressed, wait a bit more
                setTimeout(waitForKeyRelease, 10)
              } else {
                // Keys released, now simulate copy
                //console.log("[CLEANUP] Keys released, simulating copy")
                simulateCopy().then(() => {
                  //console.log("[CLEANUP] Copy simulation successful")
                  setTimeout(() => {
                    const selectedText = clipboard.readText()
                    console.log("[CLEANUP] Captured text:", selectedText.substring(0, 100) + (selectedText.length > 100 ? "..." : ""))
                    if (selectedText.trim()) {
                      state.isCleanupMode = true
                      state.selectedText = selectedText
                      console.log("[CLEANUP] Starting recording panel")
                      showPanelWindowAndStartRecording()
                    } else {
                      console.log("[CLEANUP] No text captured from clipboard")
                      // Reset flag if no text captured
                      state.isCleanupRecording = false
                      state.isCleanupMode = false
                      state.selectedText = ""
                    }
                  }, 200)
                }).catch((error) => {
                  console.error("[CLEANUP] Failed to simulate copy:", error)
                  // Reset flag on error
                  state.isCleanupRecording = false
                })
              }
            }

            // Start waiting for key release
            setTimeout(waitForKeyRelease, 10)
          } else {
            // Second press: stop recording
            console.log("[CLEANUP] Stopping cleanup recording")
            state.isCleanupRecording = false
            getWindowRendererHandlers("panel")?.finishRecording.send()
          }
          return
        }
      }

      const shortcut = configStore.get().shortcut
      
      if (shortcut === "ctrl-slash") {
        if (e.data.key === "Slash" && isPressedCtrlKey) {
          getWindowRendererHandlers("panel")?.startOrFinishRecording.send()
        }
      } else if (shortcut === "ctrl-windows") {
        if (e.data.key === "MetaLeft" && isPressedCtrlKey) {
          getWindowRendererHandlers("panel")?.startOrFinishRecording.send()
        }
      } else if (shortcut === "ctrl-alt") {
        if ((e.data.key === "Alt" || e.data.key === "AltGr") && isPressedCtrlKey) {
          getWindowRendererHandlers("panel")?.startOrFinishRecording.send()
        }
      } else {
        // hold-ctrl shortcut
        if (e.data.key === "ControlLeft") {
          if (hasRecentKeyPress()) {
            console.log("ignore ctrl because other keys are pressed", [
              ...keysPressed.keys(),
            ])
            return
          }

          if (startRecordingTimer) {
            // console.log('already started recording timer')
            return
          }

          startRecordingTimer = setTimeout(() => {
            isHoldingCtrlKey = true

            console.log("start recording")

            showPanelWindowAndStartRecording()
          }, 800)
        } else {
          keysPressed.set(e.data.key, e.time.secs_since_epoch)
          cancelRecordingTimer()

          // when holding ctrl key, pressing any other key will stop recording
          if (isHoldingCtrlKey) {
            stopRecordingAndHidePanelWindow()
          }

          isHoldingCtrlKey = false
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

      if (shortcut === "ctrl-slash" || shortcut === "ctrl-windows" || shortcut === "ctrl-alt") {
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
