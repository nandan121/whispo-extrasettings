import type { CHAT_PROVIDER_ID, STT_PROVIDER_ID } from "."

export type RecordingHistoryItem = {
  id: string
  createdAt: number
  duration: number
  transcript: string
}

export type Config = {
  shortcut?: string
  shortcutMode?: "hold" | "toggle"
  cleanupShortcut?: string
  cleanupShortcutMode?: "hold" | "toggle"
  hideDockIcon?: boolean

  sttProviderId?: STT_PROVIDER_ID

  openaiApiKey?: string
  openaiBaseUrl?: string
  openaiSttModel?: string
  openaiChatModel?: string

  groqApiKey?: string
  groqBaseUrl?: string
  groqSttModel?: string
  groqChatModel?: string

  geminiApiKey?: string
  geminiBaseUrl?: string
  geminiChatModel?: string

  transcriptPostProcessingEnabled?: boolean
  transcriptPostProcessingProviderId?: CHAT_PROVIDER_ID
  transcriptPostProcessingPrompt?: string

  textCleanupEnabled?: boolean
  textCleanupProviderId?: CHAT_PROVIDER_ID
  textCleanupPromptTemplate?: string
}
