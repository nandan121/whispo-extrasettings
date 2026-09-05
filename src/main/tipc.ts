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
import {
  GEMINI_FILE_MODEL_DEFAULT,
  GEMINI_LIVE_MODEL_DEFAULT,
  mapLanguageToCodes,
  parseCustomVocabulary,
  transcribeAudioWithGeminiFile,
} from "./gemini"
import { MainGeminiLiveSession } from "./gemini-live"
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

// ---------------------------------------------------------------------------
// Shared finalization: cleanup/command/post-processing, history, paste.
// `rawTranscript` is the verbatim STT text (any provider, file or live).
// `audio` is optional — live sessions have no recording file to persist.
// ---------------------------------------------------------------------------
async function finalizeTranscription(
  rawTranscript: string,
  duration: number,
  audio?: ArrayBuffer,
) {
  const config = configStore.get()
  let finalText = rawTranscript
  let finalTextForHistory = "STT:" + rawTranscript

  // Handle cleanup mode vs normal dictation
  if (state.isCleanupMode && state.selectedText) {
    // Process cleanup: use transcript as command on selected text
    finalText = await processTextCleanup(state.selectedText, rawTranscript)
    finalTextForHistory +=
      "\nSELECTED:" + state.selectedText + "\nCLEANED:" + finalText
    console.log(
      "[CLEANUP] LLM result:",
      finalText.substring(0, 200) + (finalText.length > 200 ? "..." : ""),
    )

    // Reset cleanup state
    state.isCleanupMode = false
    state.selectedText = ""
    state.isCleanupRecording = false
  } else if (state.isCommandMode) {
    console.log("[COMMAND] Command Mode - Transcript:", rawTranscript)
    const commandText = rawTranscript.trim()
    const mappings = config.commandMappings || []

    // Sort mappings by prefix length (descending) to match longest prefix first
    mappings.sort((a, b) => b.prefix.length - a.prefix.length)

    let matchedMapping = mappings.find((m) =>
      commandText.toLowerCase().startsWith(m.prefix.toLowerCase()),
    )
    let actionToExecute = ""

    if (matchedMapping) {
      console.log("[COMMAND] Matched prefix:", matchedMapping.prefix)
      const commandArg = commandText.slice(matchedMapping.prefix.length).trim()
      actionToExecute = matchedMapping.action.replace(
        "{command}",
        encodeURIComponent(commandArg),
      )
    } else {
      // No prefix match - Fallback logic
      if (
        commandText.startsWith("http://") ||
        commandText.startsWith("https://")
      ) {
        actionToExecute = commandText
      } else {
        const defaultMapping = mappings.find((m) => m.isDefault)
        if (defaultMapping) {
          console.log("[COMMAND] Using default mapping:", defaultMapping.name)
          actionToExecute = defaultMapping.action.replace(
            "{command}",
            encodeURIComponent(commandText),
          )
        } else {
          // System command fallback
          actionToExecute = commandText
        }
      }
    }

    console.log("[COMMAND] Executing:", actionToExecute)

    if (
      actionToExecute.startsWith("http://") ||
      actionToExecute.startsWith("https://")
    ) {
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

    finalTextForHistory += `\nNO SELECTION DETECTED\nCOMMAND EXECUTED: ${actionToExecute}`
  } else if (config.transcriptPostProcessingEnabled) {
    // Normal dictation: post-process transcript
    finalText = await postProcessTranscript(rawTranscript)
    finalTextForHistory += "\nPROCESSED:" + finalText
  }

  const history = getRecordingHistory()
  const item: RecordingHistoryItem = {
    id: Date.now().toString(),
    createdAt: Date.now(),
    duration,
    transcript: finalTextForHistory,
  }
  history.push(item)
  saveRecordingsHistory(history)

  if (audio) {
    fs.writeFileSync(
      path.join(recordingsFolder, `${item.id}.webm`),
      Buffer.from(audio),
    )
  }

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
}

// Single active Gemini Live session (one panel / one mic).
let liveSession: MainGeminiLiveSession | null = null

const sendLiveUpdateToPanel = (update: {
  kind: "interim" | "error"
  text: string
}) => {
  const panel = WINDOWS.get("panel")
  if (panel) {
    getRendererHandlers<RendererHandlers>(
      panel.webContents,
    ).geminiLiveUpdate.send(update)
  }
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
      
      // ---------------------------------------------------------------------------
      // Resolve STT credentials ONLY for the currently selected STT provider.
      // Other providers' settings are never read, so missing STT models on
      // non-STT providers cannot cause validation failures.
      // ---------------------------------------------------------------------------
      const sttProviderId = config.sttProviderId || "groq"

      let sttApiKey: string
      let sttBaseUrl: string
      let sttModel: string

      switch (sttProviderId) {
        case "groq":
          sttApiKey = config.groqApiKey || ""
          sttBaseUrl = config.groqBaseUrl || "https://api.groq.com/openai/v1"
          sttModel = config.groqSttModel || "whisper-large-v3"
          break
        case "openai":
          sttApiKey = config.openaiApiKey || ""
          sttBaseUrl = config.openaiBaseUrl || "https://api.openai.com/v1"
          sttModel = config.openaiSttModel || "whisper-1"
          break
        case "custom1":
          sttApiKey = config.custom1ApiKey || ""
          sttBaseUrl = config.custom1BaseUrl || ""
          sttModel = config.custom1SttModel || ""
          break
        case "custom2":
          sttApiKey = config.custom2ApiKey || ""
          sttBaseUrl = config.custom2BaseUrl || ""
          sttModel = config.custom2SttModel || ""
          break
        case "gemini":
        case "gemini-live":
          // Resolved in the Gemini branch below (Developer API + AI Studio
          // key); placeholders keep the shared validation happy.
          sttApiKey = ""
          sttBaseUrl = ""
          sttModel = config.geminiSttModel || GEMINI_FILE_MODEL_DEFAULT
          break
        default:
          sttApiKey = config.groqApiKey || ""
          sttBaseUrl = config.groqBaseUrl || "https://api.groq.com/openai/v1"
          sttModel = config.groqSttModel || "whisper-large-v3"
      }

      if (!sttModel) {
        throw new Error(
          `The selected STT provider "${sttProviderId}" does not have an STT model configured. ` +
          `Please set an STT model in the Providers tab, or choose a different STT provider.`
        )
      }

      // Gemini (AI Studio key) uses the Developer API, not OpenAI-compat.
      // "gemini-live" falls back to the file model here; true streaming
      // happens in the panel via the Live API WebSocket.
      if (sttProviderId === "gemini" || sttProviderId === "gemini-live") {
        const rawTranscript = await transcribeAudioWithGeminiFile(
          input.recording,
          "audio/webm",
        )
        console.log(
          "[GEMINI] File transcription:",
          rawTranscript.slice(0, 200),
        )
        await finalizeTranscription(
          rawTranscript,
          input.duration,
          input.recording,
        )
        return
      }

      const form = new FormData()
      form.append(
        "file",
        new File([input.recording], "recording.webm", { type: "audio/webm" }),
      )
      form.append("model", sttModel)
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

      const transcriptResponse = await fetch(
        `${sttBaseUrl}/audio/transcriptions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sttApiKey}`,
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
      
      await finalizeTranscription(json.text, input.duration, input.recording)
    }),

  saveLiveTranscription: t.procedure
    .input<{ transcript: string; duration: number }>()
    .action(async ({ input }) => {
      fs.mkdirSync(recordingsFolder, { recursive: true })
      console.log(
        `[GEMINI-LIVE] saveLiveTranscription len=${input.transcript?.length || 0} duration=${input.duration}`,
      )

      const transcript = input.transcript?.trim()
      if (!transcript) {
        const panel = WINDOWS.get("panel")
        panel?.hide()
        return
      }

      // Live transcripts (e.g. Gemini Live) arrive as final text — skip STT
      // and run the shared cleanup/history/paste flow (no audio file).
      await finalizeTranscription(transcript, input.duration)
    }),

  // Fire-and-forget diagnostic sink for the renderer's live session.
  // Visible in dev logs / packaged main log as [GEMINI-LIVE-R].
  geminiLiveLog: t.procedure
    .input<{ message: string }>()
    .action(async ({ input }) => {
      console.log(`[GEMINI-LIVE-R] ${input.message}`)
    }),

  // --- Gemini Live (main-process Node WebSocket session) -------------------
  // The renderer captures mic PCM and streams base64 chunks here; interim
  // text flows back via the geminiLiveUpdate renderer handler.
  geminiLiveStart: t.procedure.action(async () => {
    const config = configStore.get()
    const apiKey = config.geminiApiKey || ""
    if (!apiKey) {
      throw new Error(
        'Gemini API key is required. Add your AI Studio key in Settings → Providers → Gemini ("Get API key" at aistudio.google.com).',
      )
    }
    liveSession?.abort()
    const session = (liveSession = new MainGeminiLiveSession({
      onInterim: (text) =>
        sendLiveUpdateToPanel({ kind: "interim", text }),
      onError: (message) =>
        sendLiveUpdateToPanel({ kind: "error", text: message }),
    }))
    await session.connect({
      apiKey,
      model: config.geminiLiveSttModel || GEMINI_LIVE_MODEL_DEFAULT,
      languageCodes: mapLanguageToCodes(config.transcriptionLanguage),
      customVocabulary:
        config.transcriptionPromptEnabled !== false
          ? parseCustomVocabulary(config.transcriptionPrompt)
          : undefined,
    })
  }),

  geminiLiveSendAudio: t.procedure
    .input<{ chunk: string }>()
    .action(async ({ input }) => {
      liveSession?.sendPcm16Base64(input.chunk)
    }),

  geminiLiveStop: t.procedure.action(async () => {
    const session = liveSession
    liveSession = null
    if (!session) return { transcript: "" }
    const transcript = await session.finish()
    return { transcript }
  }),

  geminiLiveAbort: t.procedure.action(async () => {
    liveSession?.abort()
    liveSession = null
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
