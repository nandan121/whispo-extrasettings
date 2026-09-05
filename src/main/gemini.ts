import { configStore } from "./config"

// ---------------------------------------------------------------------------
// Gemini Transcription via the Gemini Developer API (AI Studio key).
//
// Works with a plain AI Studio API key — no GCP project, Vertex, or OAuth.
// File model:  gemini-3.5-transcribe      (generateContent, one shot)
// Live model:  gemini-3.5-transcribe-live (Live API WebSocket, see
//              src/renderer/src/lib/gemini-live.ts for the streaming client)
//
// NOTE: the "-preview" suffixed IDs (gemini-3.5-transcribe-preview,
// gemini-3.5-transcribe-live-preview) are Vertex/Agent Platform only and 404
// on the Developer API. GA names (no suffix) are served here.
//
// Docs:
// https://ai.google.dev/gemini-api/docs/changelog (GA announcement)
// https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-5-transcribe/
// ---------------------------------------------------------------------------

export const GEMINI_FILE_MODEL_DEFAULT = "gemini-3.5-transcribe"
export const GEMINI_LIVE_MODEL_DEFAULT = "gemini-3.5-transcribe-live"
const GEMINI_API_BASE_DEFAULT =
  "https://generativelanguage.googleapis.com/v1beta"

// Whispo stores ISO-639-1 ("de") or "auto"; Gemini wants BCP-47 ("de-DE").
// Unknown 2-letter codes fall back to "<lang>-<LANG>" which Gemini still
// accepts as a hint; "auto" (or empty) means omit for auto-detection.
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

export function mapLanguageToCodes(language?: string): string[] | undefined {
  if (!language || language === "auto") return undefined
  if (language.includes("-")) return [language]
  return [REGION_FALLBACK[language] || language]
}

// "ChatGPT, OpenAI\nGroq" -> ["ChatGPT", "OpenAI", "Groq"] (max 100, best ≤100)
export function parseCustomVocabulary(prompt?: string): string[] | undefined {
  if (!prompt) return undefined
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

// MediaRecorder gives "audio/webm;codecs=opus". Gemini must see audio/webm —
// video/webm yields an empty transcript (no error), see:
// https://github.com/BerriAI/litellm/issues/38963
export function normalizeAudioMime(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase()
  if (base === "video/webm") return "audio/webm"
  if (!base) return "audio/webm"
  return base
}

type GeminiPart = {
  text?: string
  audioTranscription?: { text?: string }
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
  promptFeedback?: { blockReason?: string }
}

function extractTranscriptText(json: GeminiGenerateContentResponse): string {
  const parts = json.candidates?.[0]?.content?.parts || []
  const text = parts
    .map((p) => p.text || p.audioTranscription?.text || "")
    .join("")
    .trim()
  return text
}

/**
 * One-shot file transcription with an AI Studio API key.
 * Throws on HTTP errors, safety blocks, or empty transcripts.
 */
export async function transcribeAudioWithGeminiFile(
  audio: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const config = configStore.get()
  const apiKey = config.geminiApiKey || ""
  if (!apiKey) {
    throw new Error(
      'Gemini API key is required. Add your AI Studio key in Settings → Providers → Gemini ("Get API key" at aistudio.google.com).',
    )
  }
  const model = config.geminiSttModel || GEMINI_FILE_MODEL_DEFAULT
  const baseUrl = (config.geminiBaseUrl || GEMINI_API_BASE_DEFAULT).replace(
    /\/$/,
    "",
  )

  // Language/vocabulary hints go into the prompt: the Developer API serves
  // the GA model as audio understanding via generateContent (the structured
  // audioTranscriptionConfig is a Vertex-only field).
  const languageCodes = mapLanguageToCodes(config.transcriptionLanguage)
  const customVocabulary =
    config.transcriptionPromptEnabled !== false
      ? parseCustomVocabulary(config.transcriptionPrompt)
      : undefined

  let prompt =
    "Transcribe this audio verbatim. Output only the transcription text, no commentary, no formatting."
  if (languageCodes) {
    prompt += ` Spoken language: ${languageCodes.join(", ")}.`
  }
  if (customVocabulary) {
    prompt += ` Key terms (use these exact spellings when heard): ${customVocabulary.join(", ")}.`
  }

  const body = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: normalizeAudioMime(mimeType),
              data: Buffer.from(audio).toString("base64"),
            },
          },
          { text: prompt },
        ],
      },
    ],
  }

  const response = await fetch(
    `${baseUrl}/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const message = `${response.statusText} ${(await response.text()).slice(0, 300)}`
    const hint =
      response.status === 404
        ? " (Check the STT model in Settings → Providers → Gemini: AI Studio keys need the GA names 'gemini-3.5-transcribe' / 'gemini-3.5-transcribe-live', not the Vertex '-preview' IDs.)"
        : ""
    throw new Error(`Gemini transcription failed: ${message}${hint}`)
  }

  const json = (await response.json()) as GeminiGenerateContentResponse
  if (json.promptFeedback?.blockReason) {
    throw new Error(
      `Gemini transcription blocked: ${json.promptFeedback.blockReason}`,
    )
  }

  const text = extractTranscriptText(json)
  if (!text) {
    throw new Error(
      "Gemini returned an empty transcript (silence, unsupported audio, or model preview issue).",
    )
  }
  return text
}
