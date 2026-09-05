import { GoogleGenAI, Modality } from "@google/genai"
import {
  describeLiveClose,
  describeLiveError,
} from "../shared/gemini-live-errors"
import { GEMINI_LIVE_MODEL_DEFAULT } from "./gemini"

// ---------------------------------------------------------------------------
// Gemini Live session for the MAIN process (Node WebSocket transport).
//
// The Live WebSocket is deliberately hosted here, not in the renderer:
// Electron's Chromium network stack fails the handshake opaquely
// ({ isTrusted: true }, no close code) in some environments, while the
// exact same session over Node's WebSocket works. The renderer only
// captures mic PCM and streams it here over IPC; interim/final text flows
// back via RendererHandlers.
//
// Model: gemini-3.5-transcribe-live (Developer API + AI Studio key).
// Audio: base64 16-bit PCM mono 16kHz via sendRealtimeInput.
// ---------------------------------------------------------------------------

export type MainLiveCallbacks = {
  onInterim?: (fullText: string) => void
  onFinal?: (fullText: string) => void
  onError?: (message: string) => void
  onLog?: (message: string) => void
}

type LiveSession = Awaited<ReturnType<GoogleGenAI["live"]["connect"]>>

export class MainGeminiLiveSession {
  private ai: GoogleGenAI | null = null
  private session: LiveSession | null = null
  private opened = false
  private closed = false
  private intentionalClose = false
  private finals: string[] = []
  private currentInterim = ""
  private chunkCount = 0
  private msgCount = 0
  lastError: string | null = null

  constructor(private callbacks: MainLiveCallbacks = {}) {}

  private log(message: string): void {
    console.log(`[GEMINI-LIVE-M] ${message}`)
    try {
      this.callbacks.onLog?.(message)
    } catch {
      // logging must never break transcription
    }
  }

  get finalTranscript(): string {
    return [...this.finals, this.currentInterim].join(" ").trim()
  }

  async connect(opts: {
    apiKey: string
    model?: string
    languageCodes?: string[]
    customVocabulary?: string[]
  }): Promise<void> {
    if (!opts.apiKey) {
      throw new Error("Gemini API key is required.")
    }
    const model = opts.model || GEMINI_LIVE_MODEL_DEFAULT
    this.log(
      `connect model=${model} lang=${opts.languageCodes?.join(",") || "auto"} vocab=${opts.customVocabulary?.length || 0}`,
    )
    this.ai = new GoogleGenAI({ apiKey: opts.apiKey })
    this.closed = false
    this.opened = false
    this.intentionalClose = false
    this.lastError = null
    this.finals = []
    this.currentInterim = ""
    this.chunkCount = 0
    this.msgCount = 0

    // Never wedge the panel on a dead handshake: fail loudly instead.
    this.session = await Promise.race([
      this.ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.TEXT],
          inputAudioTranscription: {
            ...(opts.languageCodes
              ? { languageCodes: opts.languageCodes }
              : {}),
            ...(opts.customVocabulary
              ? { customVocabulary: opts.customVocabulary }
              : {}),
          },
        },
        callbacks: {
          onopen: () => {
            this.opened = true
            this.log("ws open")
          },
          onmessage: (msg) => {
            const record = msg as { serverContent?: Record<string, unknown> }
            const sc = record?.serverContent
            const scKeys =
              sc && typeof sc === "object" ? Object.keys(sc).join(",") : "-"
            const interim = (
              sc as
                | { interimInputTranscription?: { text?: unknown } }
                | undefined
            )?.interimInputTranscription
            const final = (
              sc as { inputTranscription?: { text?: unknown } } | undefined
            )?.inputTranscription
            this.msgCount++
            if (this.msgCount <= 5 || this.msgCount % 25 === 0) {
              const ilen =
                typeof interim?.text === "string"
                  ? interim.text.length
                  : typeof interim?.text
              const flen =
                typeof final?.text === "string"
                  ? final.text.length
                  : typeof final?.text
              this.log(
                `msg#${this.msgCount} server=[${scKeys}] interim=${ilen} final=${flen}`,
              )
            }
            const serverContent = record?.serverContent as
              | {
                  interimInputTranscription?: { text?: string }
                  inputTranscription?: { text?: string }
                }
              | undefined
            if (!serverContent) return

            if (serverContent.interimInputTranscription?.text) {
              this.currentInterim =
                serverContent.interimInputTranscription.text
              this.callbacks.onInterim?.(
                [...this.finals, this.currentInterim].join(" ").trim(),
              )
            }
            if (serverContent.inputTranscription?.text) {
              this.finals.push(serverContent.inputTranscription.text)
              this.currentInterim = ""
              const full = this.finals.join(" ").trim()
              this.callbacks.onInterim?.(full)
              this.callbacks.onFinal?.(full)
            }
          },
          onerror: (e) => {
            if (this.intentionalClose) {
              this.log("onerror ignored (intentional teardown)")
              return
            }
            const message = describeLiveError(e)
            this.lastError = message
            this.log(`onerror: ${message}`)
            this.callbacks.onError?.(message)
          },
          onclose: (e) => {
            const rec = e as { code?: unknown; reason?: unknown } | undefined
            this.log(
              `onclose: code=${rec && typeof rec === "object" && "code" in rec ? String(rec.code) : "?"} intentional=${this.intentionalClose}`,
            )
            if (this.intentionalClose || this.finalTranscript) return
            const message = describeLiveClose(e)
            this.lastError = message
            this.callbacks.onError?.(message)
          },
        },
      }),
      (async () => {
        await new Promise((r) => setTimeout(r, 10000))
        throw new Error(
          "Live session did not connect within 10s (network or handshake failure).",
        )
      })(),
    ])
    this.log("connect resolved")
  }

  sendPcm16Base64(data: string): void {
    if (!this.session || this.closed) return
    if (!this.opened) return
    this.chunkCount++
    if (this.chunkCount === 1 || this.chunkCount % 100 === 0) {
      this.log(`send chunk#${this.chunkCount} b64len=${data.length}`)
    }
    this.session.sendRealtimeInput({
      audio: { data, mimeType: "audio/pcm;rate=16000" },
    })
  }

  async finish(timeoutMs = 6000): Promise<string> {
    return Promise.race([
      this.finishInner(timeoutMs),
      (async () => {
        await new Promise((r) => setTimeout(r, 15000))
        this.log("finish: overall 15s timeout, force-closing")
        this.forceClose()
        return this.finalTranscript
      })(),
    ])
  }

  private forceClose(): void {
    this.intentionalClose = true
    this.closed = true
    try {
      this.session?.close()
    } catch {
      // ignore
    }
    this.session = null
  }

  private async finishInner(timeoutMs: number): Promise<string> {
    const session = this.session
    this.session = null
    this.intentionalClose = true
    if (!session) {
      throw new Error(this.lastError ?? "Live session was never established.")
    }
    const openDeadline = Date.now() + 3000
    while (!this.opened && !this.closed && Date.now() < openDeadline) {
      await new Promise((r) => setTimeout(r, 100))
    }
    if (!this.opened) {
      try {
        session.close()
      } catch {
        // ignore
      }
      this.closed = true
      throw new Error(this.lastError ?? "Live session did not open in time.")
    }
    try {
      session.sendRealtimeInput({ audioStreamEnd: true })
      this.log(
        `finish: audioStreamEnd sent after ${this.chunkCount} chunks, waiting ${timeoutMs}ms`,
      )
    } catch {
      // ignore — session may already be closing
    }
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150))
      if (this.closed) break
    }
    try {
      session.close()
    } catch {
      // ignore
    }
    this.closed = true
    const result = this.finalTranscript
    this.log(
      `finish: done finals=${this.finals.length} resultLen=${result.length} err=${this.lastError ?? "-"}`,
    )
    return result
  }

  abort(): void {
    this.log("abort")
    this.forceClose()
  }
}
