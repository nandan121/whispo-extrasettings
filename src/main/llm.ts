import { dialog } from "electron"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { configStore } from "./config"

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

  const chatBaseUrl =
    chatProviderId === "groq"
      ? config.groqBaseUrl || "https://api.groq.com/openai/v1"
      : config.openaiBaseUrl || "https://api.openai.com/v1"

  const chatResponse = await fetch(`${chatBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chatProviderId === "groq" ? config.groqApiKey : config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      temperature: 0,
      model:
        chatProviderId === "groq"
          ? config.groqChatModel || "llama-3.3-70b-versatile"
          : config.openaiChatModel || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
    }),
  })

  if (!chatResponse.ok) {
    const message = `${chatResponse.statusText} ${(await chatResponse.text()).slice(0, 300)}`

    throw new Error(message)
  }

  const chatJson = await chatResponse.json()
  //console.log("[CLEANUP] LLM response:", chatJson)
  const result = chatJson.choices[0].message.content.trim()
  console.log("[CLEANUP] To LLM:", prompt.substring(0, 200) + (prompt.length > 200 ? "..." : ""), "\n[Response:", result.substring(0, 200) + (result.length > 200 ? "..." : ""))
  return result
}

export async function processTextCleanup(selectedText: string, command: string) {
  const config = configStore.get()

  //console.log("[CLEANUP] Full config:", JSON.stringify(config, null, 2))
  //console.log("[CLEANUP] textCleanupEnabled:", config.textCleanupEnabled)
  //console.log("[CLEANUP] textCleanupPromptTemplate:", config.textCleanupPromptTemplate)

  if (!config.textCleanupEnabled || !config.textCleanupPromptTemplate) {
    console.log("[CLEANUP] Cleanup disabled or no template, returning original text")
    return selectedText
  }

  const prompt = config.textCleanupPromptTemplate
    .replace("{selected_text}", selectedText)
    .replace("{command}", command)

  console.log("[CLEANUP] Final prompt sent to LLM:", prompt.substring(0, 500) + (prompt.length > 500 ? "..." : ""))

  const chatProviderId = config.textCleanupProviderId

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
    console.log("[CLEANUP] Gemini response:", response.substring(0, 200) + (response.length > 200 ? "..." : ""))
    return response
  }

  const chatBaseUrl =
    chatProviderId === "groq"
      ? config.groqBaseUrl || "https://api.groq.com/openai/v1"
      : config.openaiBaseUrl || "https://api.openai.com/v1"

  const chatResponse = await fetch(`${chatBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chatProviderId === "groq" ? config.groqApiKey : config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      temperature: 0,
      model:
        chatProviderId === "groq"
          ? config.groqChatModel || "llama-3.3-70b-versatile"
          : config.openaiChatModel || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
    }),
  })

  if (!chatResponse.ok) {
    const message = `${chatResponse.statusText} ${(await chatResponse.text()).slice(0, 300)}`

    throw new Error(message)
  }

  const chatJson = await chatResponse.json()
  //console.log(chatJson)
  return chatJson.choices[0].message.content.trim()
}
