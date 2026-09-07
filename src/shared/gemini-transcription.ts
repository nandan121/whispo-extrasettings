// Pure builders for Gemini transcription settings (shared main/renderer).
// No DOM/Node/Electron APIs — safe to unit-test in plain node.
//
// Covers both Gemini transcription paths:
// - File (gemini-3.5-transcribe via :generateContent): language + vocabulary
//   travel as prompt text (the structured audioTranscriptionConfig is a
//   Vertex-only field on generateContent).
// - Live (gemini-3.5-transcribe-live via BidiGenerateContent): language +
//   vocabulary + SMART mode travel as structured inputAudioTranscription.
import type {
  AudioTranscriptionConfig,
  AudioTranscriptionConfigMode,
} from "@google/genai"

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

export function buildGeminiFilePrompt(opts: {
  languageCodes?: string[]
  customVocabulary?: string[]
  smart?: boolean
}): string {
  // SMART mirrors the Live API's SMART mode server-side: disfluency removal,
  // light grammar cleanup and formatting instead of strict verbatim output.
  let prompt = opts.smart
    ? "Transcribe this audio with light cleanup: remove filler words (um, uh, ah), repetitions and false starts, fix grammar lightly, and format with paragraphs or lists where natural. Keep all spoken content and wording otherwise unchanged. Output only the transcription text, no commentary."
    : "Transcribe this audio verbatim. Output only the transcription text, no commentary, no formatting."
  if (opts.languageCodes) {
    prompt += ` Spoken language: ${opts.languageCodes.join(", ")}.`
  }
  if (opts.customVocabulary) {
    prompt += ` Key terms (use these exact spellings when heard): ${opts.customVocabulary.join(", ")}.`
  }
  return prompt
}

export function buildLiveTranscriptionConfig(opts: {
  languageCodes?: string[]
  customVocabulary?: string[]
  smart?: boolean
}): AudioTranscriptionConfig {
  // The enum import is type-only (erased at runtime) so this module stays
  // dependency-free; the Live API accepts the plain "SMART" string.
  return {
    ...(opts.languageCodes ? { languageCodes: opts.languageCodes } : {}),
    ...(opts.customVocabulary ? { customVocabulary: opts.customVocabulary } : {}),
    ...(opts.smart
      ? { mode: "SMART" as AudioTranscriptionConfigMode }
      : {}),
  }
}
