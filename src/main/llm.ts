import { dialog } from "electron"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { configStore } from "./config"
import { Config } from "../shared/types"
import { CHAT_PROVIDER_ID } from "../shared/index"

// ---------------------------------------------------------------------------
// Helper: resolve API key, base URL, and chat model for a given chat provider.
// Only the provider that is actually SELECTED for an activity gets resolved,
// so unconfigured providers never cause validation errors.
// ---------------------------------------------------------------------------
function resolveChatProvider(
  config: Config,
  providerId: CHAT_PROVIDER_ID | undefined,
): { apiKey: string; baseUrl: string; chatModel: string } {
  switch (providerId) {
    case "groq":
      return {
        apiKey: config.groqApiKey || "",
        baseUrl: config.groqBaseUrl || "https://api.groq.com/openai/v1",
        chatModel: config.groqChatModel || "llama-3.3-70b-versatile",
      }
    case "openai":
      return {
        apiKey: config.openaiApiKey || "",
        baseUrl: config.openaiBaseUrl || "https://api.openai.com/v1",
        chatModel: config.openaiChatModel || "gpt-4o-mini",
      }
    case "custom1":
      return {
        apiKey: config.custom1ApiKey || "",
        baseUrl: config.custom1BaseUrl || "",
        chatModel: config.custom1ChatModel || "",
      }
    case "custom2":
      return {
        apiKey: config.custom2ApiKey || "",
        baseUrl: config.custom2BaseUrl || "",
        chatModel: config.custom2ChatModel || "",
      }
    default:
      // Fall back to groq for legacy / undefined
      return {
        apiKey: config.groqApiKey || "",
        baseUrl: config.groqBaseUrl || "https://api.groq.com/openai/v1",
        chatModel: config.groqChatModel || "llama-3.3-70b-versatile",
      }
  }
}

// ---------------------------------------------------------------------------
// Shared OpenAI-compatible chat completion call
// ---------------------------------------------------------------------------
async function openAiCompatChatCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  if (!baseUrl) throw new Error("Provider base URL is not configured")
  if (!apiKey) throw new Error("Provider API key is not configured")
  if (!model) throw new Error("Provider chat model is not configured")

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      temperature: 0,
      model,
      messages: [{ role: "system", content: prompt }],
    }),
  })

  if (!response.ok) {
    const message = `${response.statusText} ${(await response.text()).slice(0, 300)}`
    throw new Error(message)
  }

  const json = await response.json()
  return json.choices[0].message.content.trim()
}

// ---------------------------------------------------------------------------
// postProcessTranscript — only uses the transcriptPostProcessingProviderId
// ---------------------------------------------------------------------------
export async function postProcessTranscript(transcript: string) {
  const config = configStore.get()

  if (
    !config.transcriptPostProcessingEnabled ||
    !config.transcriptPostProcessingPrompt
  ) {
    console.log(
      "[CLEANUP] Post-processing disabled or no prompt: Transcript\n",
      transcript.substring(0, 200) + (transcript.length > 200 ? "..." : ""),
    )
    return transcript
  }

  const prompt = config.transcriptPostProcessingPrompt.replace(
    "{transcript}",
    transcript,
  )

  const chatProviderId = config.transcriptPostProcessingProviderId

  // Gemini uses its own SDK
  if (chatProviderId === "gemini") {
    if (!config.geminiApiKey) throw new Error("Gemini API key is required")

    const gai = new GoogleGenerativeAI(config.geminiApiKey)
    const gModel = gai.getGenerativeModel({
      model: config.geminiChatModel || "gemini-flash-latest",
    })

    const result = await gModel.generateContent([prompt], {
      baseUrl: config.geminiBaseUrl,
    })
    return result.response.text().trim()
  }

  // All other providers use OpenAI-compatible API
  const { apiKey, baseUrl, chatModel } = resolveChatProvider(config, chatProviderId)
  const result = await openAiCompatChatCompletion(baseUrl, apiKey, chatModel, prompt)
  console.log(
    "[CLEANUP] To LLM:",
    prompt.substring(0, 200) + (prompt.length > 200 ? "..." : ""),
    "\n[Response:",
    result.substring(0, 200) + (result.length > 200 ? "..." : ""),
  )
  return result
}

// ---------------------------------------------------------------------------
// processTextCleanup — only uses the textCleanupProviderId
// ---------------------------------------------------------------------------
export async function processTextCleanup(selectedText: string, command: string) {
  const config = configStore.get()

  if (!config.textCleanupEnabled || !config.textCleanupPromptTemplate) {
    console.log("[CLEANUP] Cleanup disabled or no template, returning original text")
    return selectedText
  }

  const prompt = config.textCleanupPromptTemplate
    .replace("{selected_text}", selectedText)
    .replace("{command}", command)

  console.log(
    "[CLEANUP] Final prompt sent to LLM:",
    prompt.substring(0, 500) + (prompt.length > 500 ? "..." : ""),
  )

  const chatProviderId = config.textCleanupProviderId

  // Gemini uses its own SDK
  if (chatProviderId === "gemini") {
    if (!config.geminiApiKey) throw new Error("Gemini API key is required")

    const gai = new GoogleGenerativeAI(config.geminiApiKey)
    const gModel = gai.getGenerativeModel({
      model: config.geminiChatModel || "gemini-flash-latest",
    })

    const result = await gModel.generateContent([prompt], {
      baseUrl: config.geminiBaseUrl,
    })
    const response = result.response.text().trim()
    console.log(
      "[CLEANUP] Gemini response:",
      response.substring(0, 200) + (response.length > 200 ? "..." : ""),
    )
    return response
  }

  // All other providers use OpenAI-compatible API
  const { apiKey, baseUrl, chatModel } = resolveChatProvider(config, chatProviderId)
  const result = await openAiCompatChatCompletion(baseUrl, apiKey, chatModel, prompt)
  return result
}
