import fs from "fs"
import { getRendererHandlers, tipc } from "@egoist/tipc/main"
import { showPanelWindow, WINDOWS } from "./window"
import {
  app,
  clipboard,
  Menu,
  shell,
  systemPreferences,
  dialog,
} from "electron"
import path from "path"
import { configStore, recordingsFolder } from "./config"
import { Config, RecordingHistoryItem } from "../shared/types"
import { RendererHandlers } from "./renderer-handlers"
import { postProcessTranscript, processTextCleanup } from "./llm"
import { state } from "./state"
import { updateTrayIcon } from "./tray"
import { isAccessibilityGranted } from "./utils"
import { writeText } from "./keyboard"

const t = tipc.create()

const getRecordingHistory = () => {
  try {
    const history = JSON.parse(
      fs.readFileSync(path.join(recordingsFolder, "history.json"), "utf8"),
    ) as RecordingHistoryItem[]

    // sort desc by createdAt
    return history.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

const saveRecordingsHistory = (history: RecordingHistoryItem[]) => {
  fs.writeFileSync(
    path.join(recordingsFolder, "history.json"),
    JSON.stringify(history),
  )
}

export const router = {
  restartApp: t.procedure.action(async () => {
    app.relaunch()
    app.quit()
  }),

  quitApp: t.procedure.action(async () => {
    app.quit()
  }),

  getUpdateInfo: t.procedure.action(async () => {
    const { getUpdateInfo } = await import("./updater")
    return getUpdateInfo()
  }),

  quitAndInstall: t.procedure.action(async () => {
    const { quitAndInstall } = await import("./updater")

    quitAndInstall()
  }),

  checkForUpdatesAndDownload: t.procedure.action(async () => {
    const { checkForUpdatesAndDownload } = await import("./updater")

    return checkForUpdatesAndDownload()
  }),

  openMicrophoneInSystemPreferences: t.procedure.action(async () => {
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    )
  }),

  hidePanelWindow: t.procedure.action(async () => {
    const panel = WINDOWS.get("panel")

    panel?.hide()
  }),

  showContextMenu: t.procedure
    .input<{ x: number; y: number; selectedText?: string }>()
    .action(async ({ input, context }) => {
      const items: Electron.MenuItemConstructorOptions[] = []

      if (input.selectedText) {
        items.push({
          label: "Copy",
          click() {
            clipboard.writeText(input.selectedText || "")
          },
        })
      }

      if (import.meta.env.DEV) {
        items.push({
          label: "Inspect Element",
          click() {
            context.sender.inspectElement(input.x, input.y)
          },
        })
      }

      const panelWindow = WINDOWS.get("panel")
      const isPanelWindow = panelWindow?.webContents.id === context.sender.id

      if (isPanelWindow) {
        items.push({
          label: "Close",
          click() {
            panelWindow?.hide()
          },
        })
      }

      const menu = Menu.buildFromTemplate(items)
      menu.popup({
        x: input.x,
        y: input.y,
      })
    }),

  getMicrophoneStatus: t.procedure.action(async () => {
    return systemPreferences.getMediaAccessStatus("microphone")
  }),

  isAccessibilityGranted: t.procedure.action(async () => {
    return isAccessibilityGranted()
  }),

  requestAccesssbilityAccess: t.procedure.action(async () => {
    if (process.platform === "win32") return true

    return systemPreferences.isTrustedAccessibilityClient(true)
  }),

  requestMicrophoneAccess: t.procedure.action(async () => {
    return systemPreferences.askForMediaAccess("microphone")
  }),

  showPanelWindow: t.procedure.action(async () => {
    showPanelWindow()
  }),

  displayError: t.procedure
    .input<{ title?: string; message: string }>()
    .action(async ({ input }) => {
      dialog.showErrorBox(input.title || "Error", input.message)
    }),

  createRecording: t.procedure
    .input<{
      recording: ArrayBuffer
      duration: number
    }>()
    .action(async ({ input }) => {
      fs.mkdirSync(recordingsFolder, { recursive: true })

      const config = configStore.get()
      
      const form = new FormData()
      form.append(
        "file",
        new File([input.recording], "recording.webm", { type: "audio/webm" }),
      )
      form.append(
        "model",
        config.sttProviderId === "groq"
          ? config.groqSttModel || "whisper-large-v3"
          : config.openaiSttModel || "whisper-1",
      )
      form.append("response_format", "verbose_json")

      // Add language if specified and not "auto"
      if (config.transcriptionLanguage && config.transcriptionLanguage !== "auto") {
        form.append("language", config.transcriptionLanguage)
      }

      // Track if we're sending a prompt (affects no_speech_prob reliability)
      const isPromptSent = !!(config.transcriptionPrompt && config.transcriptionPromptEnabled !== false)

      // Add prompt if specified AND enabled
      if (isPromptSent) {
        form.append("prompt", config.transcriptionPrompt!)
      }

      const groqBaseUrl = config.groqBaseUrl || "https://api.groq.com/openai/v1"
      const openaiBaseUrl = config.openaiBaseUrl || "https://api.openai.com/v1"

      const apiUrl = config.sttProviderId === "groq"
        ? `${groqBaseUrl}/audio/transcriptions`
        : `${openaiBaseUrl}/audio/transcriptions`

      const transcriptResponse = await fetch(
        apiUrl,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.sttProviderId === "groq" ? config.groqApiKey : config.openaiApiKey}`,
          },
          body: form,
        },
      )

      if (!transcriptResponse.ok) {
        const message = `${transcriptResponse.statusText} ${(await transcriptResponse.text()).slice(0, 300)}`

        throw new Error(message)
      }

      const json: { 
        text: string
        duration?: number
        segments?: Array<{
          no_speech_prob?: number
          compression_ratio?: number
          avg_logprob?: number
        }>
      } = await transcriptResponse.json()
      console.log("[CLEANUP] Raw transcription:", JSON.stringify(json))
      
      // Dual hallucination detection strategy based on prompt usage
      if (json.segments && json.segments.length > 0) {
        const avgNoSpeechProb = json.segments.reduce((sum, seg) => 
          sum + (seg.no_speech_prob || 0), 0
        ) / json.segments.length
        
        const avgCompressionRatio = json.segments.reduce((sum, seg) => 
          sum + (seg.compression_ratio || 0), 0
        ) / json.segments.length
        
        console.log(`[CLEANUP] Metrics - no_speech_prob: ${avgNoSpeechProb}, compression_ratio: ${avgCompressionRatio}, duration: ${json.duration}s, prompt_sent: ${isPromptSent}`)
        
        if (!isPromptSent) {
          // NO PROMPT: no_speech_prob is reliable, use threshold
          // Anything > 0.4 is likely silence/hallucination
          if (avgNoSpeechProb > 0.4) {
            console.log("[CLEANUP] Rejected: high no_speech_prob without prompt (likely silence)")
            const panel = WINDOWS.get("panel")
            panel?.hide()
            return
          }
        } else {
          // WITH PROMPT: no_speech_prob is unreliable, use pattern matching
          const text = json.text.toLowerCase()
          const hallucinationPatterns = [
            ' Thank you',
          ]
          
          // Only reject if it matches hallucination pattern AND audio is short
          if ((json.duration || 0) < 3 && hallucinationPatterns.some(pattern => text.startsWith(pattern.toLowerCase()))) {
            console.log("[CLEANUP] Rejected: known hallucination pattern with prompt:", text.substring(0, 50))
            const panel = WINDOWS.get("panel")
            panel?.hide()
            return
          }
        }
      }
      
      let finalText = json.text
      let finalTextForHistory = "STT:"+json.text

      // Handle cleanup mode vs normal dictation
      if (state.isCleanupMode && state.selectedText) {
        //console.log("[CLEANUP] Cleanup mode - Selected text:", state.selectedText.substring(0, 200) + (state.selectedText.length > 200 ? "..." : ""))
        //console.log("[CLEANUP] Command:", json.text)

        // Process cleanup: use transcript as command on selected text
        finalText = await processTextCleanup(state.selectedText, json.text)
        finalTextForHistory += "\nSELECTED:"+ state.selectedText+"\nCLEANED:"+finalText
        console.log("[CLEANUP] LLM result:", finalText.substring(0, 200) + (finalText.length > 200 ? "..." : ""))

        // Reset cleanup state
        state.isCleanupMode = false
        state.selectedText = ""
        state.isCleanupRecording = false
      } else if (state.isCommandMode) {
        console.log("[COMMAND] Command Mode - Transcript:", json.text)
        const commandText = json.text.trim()
        const mappings = config.commandMappings || []
        
        // Sort mappings by prefix length (descending) to match longest prefix first
        mappings.sort((a, b) => b.prefix.length - a.prefix.length)
        
        let matchedMapping = mappings.find(m => commandText.toLowerCase().startsWith(m.prefix.toLowerCase()))
        let actionToExecute = ""
        
        if (matchedMapping) {
            console.log("[COMMAND] Matched prefix:", matchedMapping.prefix)
            const commandArg = commandText.slice(matchedMapping.prefix.length).trim()
            actionToExecute = matchedMapping.action.replace("{command}", encodeURIComponent(commandArg))
        } else {
            // No prefix match - Fallback logic
            if (commandText.startsWith("http://") || commandText.startsWith("https://")) {
                actionToExecute = commandText
            } else {
                const defaultMapping = mappings.find(m => m.isDefault)
                if (defaultMapping) {
                    console.log("[COMMAND] Using default mapping:", defaultMapping.name)
                    actionToExecute = defaultMapping.action.replace("{command}", encodeURIComponent(commandText))
                } else {
                    // System command fallback
                    actionToExecute = commandText
                }
            }
        }
        
        console.log("[COMMAND] Executing:", actionToExecute)
        
        if (actionToExecute.startsWith("http://") || actionToExecute.startsWith("https://")) {
            shell.openExternal(actionToExecute)
        } else {
            // Execute as shell command
            const { exec } = await import("child_process")
            exec(actionToExecute, (error) => {
                if (error) {
                    console.error(`[COMMAND] Execution error: ${error}`)
                }
            })
        }
        
        state.isCommandMode = false
        state.isCleanupRecording = false
        
        const panel = WINDOWS.get("panel")
        if (panel) {
            panel.hide()
        }


        finalTextForHistory+=`\nNO SELECTION DETECTED\nCOMMAND EXECUTED: ${actionToExecute}`

      } else if(config.transcriptPostProcessingEnabled) {
        //console.log("[CLEANUP] Normal dictation mode")
        // Normal dictation: post-process transcript
        finalText = await postProcessTranscript(json.text)
        finalTextForHistory += "\nPROCESSED:"+finalText
      }

      const history = getRecordingHistory()
      const item: RecordingHistoryItem = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        duration: input.duration,
        transcript: finalTextForHistory,
      }
      history.push(item)
      saveRecordingsHistory(history)

      fs.writeFileSync(
        path.join(recordingsFolder, `${item.id}.webm`),
        Buffer.from(input.recording),
      )

      const main = WINDOWS.get("main")
      if (main) {
        getRendererHandlers<RendererHandlers>(
          main.webContents,
        ).refreshRecordingHistory.send()
      }

      const panel = WINDOWS.get("panel")
      if (panel) {
        panel.hide()
      }

      // Don't paste or write text in command mode
      if (!state.isCommandMode) {
        //  paste
        clipboard.writeText(finalText)
        if (isAccessibilityGranted()) {
          await writeText(finalText)
        }
      }
    }),

  clearHistory: t.procedure
    .input<{ days: number }>()
    .action(async ({ input }) => {
      if (typeof input.days !== "number") {
        throw new Error("Invalid input: days must be a number")
      }

      const days = input.days
      const threshold = Date.now() - days * 24 * 60 * 60 * 1000 // Calculate timestamp for X days ago
      const history = getRecordingHistory()

      // Filter out old history items
      const newHistory = history.filter((item) => item.createdAt >= threshold)

      // Delete old recording files
      history.forEach((item) => {
        if (item.createdAt < threshold) {
          try {
            fs.unlinkSync(path.join(recordingsFolder, `${item.id}.webm`))
          } catch (error) {
            console.error(`Failed to delete recording ${item.id}.webm:`, error)
          }
        }
      })

      saveRecordingsHistory(newHistory)

      // Notify renderer to refresh history
      const main = WINDOWS.get("main")
      if (main) {
        getRendererHandlers<RendererHandlers>(main.webContents)
          .refreshRecordingHistory.send()
      }
    }),

  getRecordingHistory: t.procedure.action(async () => getRecordingHistory()),

  deleteRecordingItem: t.procedure
    .input<{ id: string }>()
    .action(async ({ input }) => {
      const recordings = getRecordingHistory().filter(
        (item) => item.id !== input.id,
      )
      saveRecordingsHistory(recordings)
      fs.unlinkSync(path.join(recordingsFolder, `${input.id}.webm`))
    }),

  deleteRecordingHistory: t.procedure.action(async () => {
    fs.rmSync(recordingsFolder, { force: true, recursive: true })
  }),

  getConfig: t.procedure.action(async () => {
    return configStore.get()
  }),

  saveConfig: t.procedure
    .input<{ config: Config }>()
    .action(async ({ input }) => {
      configStore.save(input.config)
    }),

  recordEvent: t.procedure
    .input<{ type: "start" | "end" }>()
    .action(async ({ input }) => {
      //console.log("[CLEANUP] Recording event:", input.type, "isCleanupMode:", state.isCleanupMode)
      if (input.type === "start") {
        state.isRecording = true
      } else {
        state.isRecording = false
      }
      updateTrayIcon()
    }),
}

export type Router = typeof router
