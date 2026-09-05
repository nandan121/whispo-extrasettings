import { GoogleGenAI, Modality } from "@google/genai"

// ---------------------------------------------------------------------------
// Gemini Live transcription client (renderer / panel window).
//
// Uses the Gemini Developer API with a plain AI Studio API key — the same key
// you paste into Settings → Providers → Gemini. No GCP project, Vertex, or
// OAuth required.
//
// Model: gemini-3.5-transcribe-live (GA name on the Developer API; the
// "-live-preview" suffixed ID is Vertex-only and fails with AI Studio keys).
// Audio: 16-bit PCM mono at 16kHz, base64, via sendRealtimeInput.
// Results: interimInputTranscription (partial) + inputTranscription (final).
// ---------------------------------------------------------------------------

export const GEMINI_LIVE_DEFAULT_MODEL = "gemini-3.5-transcribe-live"

export type GeminiLiveCallbacks = {
  onInterim?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (message: string) => void
  onClose?: () => void
}

type LiveSession = Awaited<ReturnType<GoogleGenAI["live"]["connect"]>>

// ---------------------------------------------------------------------------
// Error detail extraction. The SDK types `onerror` as (e: ErrorEvent) and
// `onclose` as (e: CloseEvent) — neither is an `Error`, so a plain
// `instanceof Error` check swallows the real reason. These helpers turn any
// failure event into a human-readable message.
// ---------------------------------------------------------------------------

function safeStringify(value: unknown, maxLen = 300): string {
  try {
    const s =
      typeof value === "string" ? value : JSON.stringify(value) ?? String(value)
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s
  } catch {
    return String(value)
  }
}

function isCloseLike(
  value: unknown,
): value is { code?: unknown; reason?: unknown; wasClean?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    ("code" in value || "reason" in value || "wasClean" in value)
  )
}

export function describeLiveError(event: unknown): string {
  if (event instanceof Error) return event.message || event.name
  if (typeof event === "string") return event
  if (typeof event === "object" && event !== null) {
    // DOM ErrorEvent from the WebSocket layer.
    if ("message" in event && typeof event.message === "string" && event.message) {
      return event.message
    }
    if (isCloseLike(event)) return describeLiveClose(event)
  }
  const s = safeStringify(event)
  return s && s !== "{}" ? s : "Unknown live session error"
}

export function describeLiveClose(event: unknown): string {
  if (isCloseLike(event)) {
    const code =
      typeof event.code === "number" ? event.code : "unknown code"
    const reason =
      typeof event.reason === "string" && event.reason
        ? event.reason
        : "no reason given"
    const hint =
      code === 1006
        ? " (abnormal closure — network, proxy, or firewall interrupted the WebSocket)"
        : code === 1008
          ? " (server rejected the session — model, key entitlement, or parameters)"
          : ""
    return `Live session closed (code=${code}): ${reason}${hint}`
  }
  return `Live session closed: ${safeStringify(event)}`
}

export function floatTo16BitPCM(float32: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32.length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export class GeminiLiveTranscriber {
  private ai: GoogleGenAI | null = null
  private session: LiveSession | null = null
  private opened = false
  private closed = false
  /** Set during intentional finish()/close() so teardown events are ignored. */
  private intentionalClose = false
  private finals: string[] = []
  private currentInterim = ""
  /** Last session-level failure detail (for dialogs after finish()). */
  lastError: string | null = null

  constructor(private callbacks: GeminiLiveCallbacks = {}) {}

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
      throw new Error(
        'Gemini API key is required. Add your AI Studio key in Settings → Providers → Gemini ("Get API key" at aistudio.google.com).',
      )
    }
    this.ai = new GoogleGenAI({ apiKey: opts.apiKey })
    this.closed = false
    this.opened = false
    this.intentionalClose = false
    this.lastError = null
    this.finals = []
    this.currentInterim = ""

    this.session = await this.ai.live.connect({
      model: opts.model || GEMINI_LIVE_DEFAULT_MODEL,
      config: {
        responseModalities: [Modality.TEXT],
        inputAudioTranscription: {
          ...(opts.languageCodes ? { languageCodes: opts.languageCodes } : {}),
          ...(opts.customVocabulary
            ? { customVocabulary: opts.customVocabulary }
            : {}),
        },
      },
      callbacks: {
        onopen: () => {
          this.opened = true
        },
        onmessage: (msg) => {
          const serverContent = msg.serverContent
          if (!serverContent) return

          const interim = serverContent.interimInputTranscription as
            | { text?: string }
            | undefined
          if (interim?.text) {
            this.currentInterim = interim.text
            this.callbacks.onInterim?.(
              [...this.finals, this.currentInterim].join(" ").trim(),
            )
          }

          const final = serverContent.inputTranscription as
            | { text?: string }
            | undefined
          if (final?.text) {
            this.finals.push(final.text)
            this.currentInterim = ""
            const full = this.finals.join(" ").trim()
            this.callbacks.onInterim?.(full)
            this.callbacks.onFinal?.(full)
          }
        },
        onerror: (e) => {
          // Teardown of our own making (finish/close) is not a failure.
          if (this.intentionalClose) return
          const message = describeLiveError(e)
          this.lastError = message
          this.callbacks.onError?.(message)
        },
        onclose: (e) => {
          if (this.intentionalClose || this.finalTranscript) {
            this.callbacks.onClose?.()
            return
          }
          // Server rejections arrive as closes, not errors — surface them.
          const message = describeLiveClose(e)
          this.lastError = message
          this.callbacks.onError?.(message)
          this.callbacks.onClose?.()
        },
      },
    })
  }

  get isOpen(): boolean {
    return this.opened && !this.closed && !!this.session
  }

  sendPcm16Chunk(pcm16: ArrayBuffer): void {
    if (!this.session || this.closed) return
    // The SDK buffers until setup_complete; sending before onopen risks the
    // session being cancelled with an empty transcript on short clips.
    if (!this.opened) return
    this.session.sendRealtimeInput({
      audio: {
        data: arrayBufferToBase64(pcm16),
        mimeType: "audio/pcm;rate=16000",
      },
    })
  }

  /** End the audio stream; resolves with the concatenated final transcript. */
  async finish(timeoutMs = 6000): Promise<string> {
    const session = this.session
    this.session = null
    this.intentionalClose = true
    if (!session) {
      throw new Error(
        this.lastError ?? "Live session was never established.",
      )
    }
    // Never signal end-of-stream on a half-open socket (quick-tap race):
    // wait briefly for the session to open first.
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
      throw new Error(
        this.lastError ?? "Live session did not open in time.",
      )
    }
    try {
      session.sendRealtimeInput({ audioStreamEnd: true })
    } catch {
      // ignore — session may already be closing
    }
    // Give trailing finals a moment to arrive (Live API has no explicit
    // flush ack for transcription-only sessions).
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150))
      if (this.closed) break
    }
    try {
      session?.close()
    } catch {
      // ignore
    }
    this.closed = true
    return this.finalTranscript
  }

  close(): void {
    this.intentionalClose = true
    this.closed = true
    try {
      this.session?.close()
    } catch {
      // ignore
    }
    this.session = null
  }
}

// ---------------------------------------------------------------------------
// Microphone → 16kHz mono PCM16 chunks. Uses a downsampling AudioContext +
// ScriptProcessorNode (deprecated but dependency-free and reliable inside
// Electron's Chromium; avoids AudioWorklet bundling through electron-vite).
// ---------------------------------------------------------------------------
export async function startMicPcmStream(
  onChunk: (pcm16: ArrayBuffer) => void,
): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: "default",
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    },
    video: false,
  })

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext
  const audioContext = new AudioCtx({ sampleRate: 16000 })
  const source = audioContext.createMediaStreamSource(stream)
  // 4096 frames ≈ 256ms at 16kHz — good latency/overhead balance.
  const processor = audioContext.createScriptProcessor(4096, 1, 1)

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0)
    onChunk(floatTo16BitPCM(input))
  }

  source.connect(processor)
  // ScriptProcessorNode only pulls audio while connected downstream — sink it
  // through zero gain so the mic is captured but NOT played back out of the
  // speakers (which would cause a feedback loop).
  const sink = audioContext.createGain()
  sink.gain.value = 0
  processor.connect(sink)
  sink.connect(audioContext.destination)

  return () => {
    try {
      source.disconnect()
      processor.disconnect()
      sink.disconnect()
    } catch {
      // ignore
    }
    try {
      void audioContext.close()
    } catch {
      // ignore
    }
    stream.getTracks().forEach((track) => track.stop())
  }
}

// Reuse the same language/vocab mapping as the main-process file path:
// Whispo ISO-639-1 ("de") or "auto" → Gemini BCP-47 hints.
const REGION_FALLBACK: Record<string, string> = {
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  pt: "pt-BR",
  nl: "nl-NL",
  pl: "pl-PL",
  uk: "uk-UA",
  ru: "ru-RU",
  tr: "tr-TR",
  hi: "hi-IN",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN",
}

export function toGeminiLanguageCodes(language?: string): string[] | undefined {
  if (!language || language === "auto") return undefined
  if (language.includes("-")) return [language]
  return [REGION_FALLBACK[language] || language]
}

export function toGeminiCustomVocabulary(
  prompt?: string,
  enabled?: boolean,
): string[] | undefined {
  if (enabled === false || !prompt) return undefined
  const terms = Array.from(
    new Set(
      prompt
        .split(/[,;\n]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ).slice(0, 100)
  return terms.length > 0 ? terms : undefined
}
