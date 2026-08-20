# Whispo Provider Architecture & Settings Guide

This document explains how LLM (Language Model) and STT (Speech-to-Text) providers are configured and handled in **Whispo**, includes working `curl` examples for every provider and mode, and explains why Google Gemini behaves differently between native SDK mode and OpenAI compatibility mode.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [How Whispo Handles Providers Internally](#2-how-whispo-handles-providers-internally)
3. [Provider Comparison & Configuration](#3-provider-comparison--configuration)
4. [Curl Examples for All Providers](#4-curl-examples-for-all-providers)
   - [OpenAI (STT + Chat)](#openai-stt--chat)
   - [Groq (STT + Chat)](#groq-stt--chat)
   - [Gemini (Native Google SDK / REST API)](#gemini-native-google-sdk--rest-api)
   - [Gemini (OpenAI Compatibility Endpoint)](#gemini-openai-compatibility-endpoint)
   - [Custom OpenAI-Compatible Providers (Ollama, vLLM, OpenRouter, LM Studio)](#custom-openai-compatible-providers)
5. [The Mystery Solved: Why Gemini Failed with `/v1beta/openai` in Whispo](#5-the-mystery-solved-why-gemini-failed-with-v1betaopenai-in-whispo)
6. [Quick Reference Table](#6-quick-reference-table)

---

## 1. Architecture Overview

Whispo relies on two separate AI pipelines:

```mermaid
flowchart TD
    subgraph STT [Speech-to-Text Pipeline]
        Audio[Microphone Audio .webm] --> STT_Router{STT Provider}
        STT_Router -->|openai| OpenAI_STT[OpenAI /audio/transcriptions]
        STT_Router -->|groq| Groq_STT[Groq /audio/transcriptions]
    end

    subgraph LLM [Text Processing Pipeline]
        RawTranscript[Raw Transcript] --> PostProc{Post-Processing Enabled?}
        SelectedText[Selected Text + Command] --> Cleanup{Text Cleanup Enabled?}
        
        PostProc --> LLM_Router{Chat Provider}
        Cleanup --> LLM_Router
        
        LLM_Router -->|openai| OpenAI_Chat[fetch /chat/completions]
        LLM_Router -->|groq| Groq_Chat[fetch /chat/completions]
        LLM_Router -->|gemini| Gemini_SDK[@google/generative-ai SDK]
    end
```

1. **Speech-to-Text (STT)** (`src/main/tipc.ts` → `createRecording`)
   - Responsible for converting recorded `.webm` audio into raw text.
   - Handled via `multipart/form-data` requests to an OpenAI-compatible `/audio/transcriptions` endpoint.
   - Configurable providers: **OpenAI**, **Groq**.

2. **Text Processing & LLM Post-Processing** (`src/main/llm.ts`)
   - **Transcript Post-Processing** (`postProcessTranscript`): Corrects spelling, grammar, phonetic substitutions, formatting, and filler words.
   - **Command Mode / Text Cleanup** (`processTextCleanup`): Modifies selected text based on user voice commands.
   - Configurable providers: **OpenAI**, **Groq**, **Gemini**.

---

## 2. How Whispo Handles Providers Internally

### A. OpenAI & Groq Providers (HTTP Fetch / OpenAI Protocol)

For OpenAI and Groq, Whispo uses standard `fetch()` calls to the OpenAI-compatible REST API:

```typescript
// src/main/llm.ts
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
```

- **URL constructed**: `${chatBaseUrl}/chat/completions`
- **Authentication**: `Authorization: Bearer <API_KEY>`
- **Payload format**: OpenAI chat completions JSON schema.

---

### B. Gemini Provider (Google Generative AI SDK)

When `chatProviderId === "gemini"`, Whispo **does not** make a fetch call to an OpenAI-compatible endpoint. Instead, it initializes Google's official `@google/generative-ai` SDK:

```typescript
// src/main/llm.ts
if (chatProviderId === "gemini") {
  if (!config.geminiApiKey) throw new Error("Gemini API key is required")

  const gai = new GoogleGenerativeAI(config.geminiApiKey)
  const gModel = gai.getGenerativeModel({
    model: config.geminiChatModel || "gemini-flash-latest",
  })

  const result = await gModel.generateContent([prompt], {
    baseUrl: config.geminiBaseUrl, // Expects Google native base URL or default
  })
  return result.response.text().trim()
}
```

- **Protocol**: Google Native Generative Language API (RPC/REST).
- **Target URL generated internally by SDK**: `${geminiBaseUrl}/v1beta/models/${model}:generateContent`
- **Default Base URL**: `https://generativelanguage.googleapis.com`

---

## 3. Provider Comparison & Configuration

| Setting in Whispo UI | OpenAI Slot | Groq Slot | Gemini Slot |
| :--- | :--- | :--- | :--- |
| **Protocol** | OpenAI HTTP REST | OpenAI HTTP REST | Google Native SDK |
| **API Key** | `openaiApiKey` | `groqApiKey` | `geminiApiKey` |
| **Default Base URL** | `https://api.openai.com/v1` | `https://api.groq.com/openai/v1` | `https://generativelanguage.googleapis.com` |
| **Default STT Model** | `whisper-1` | `whisper-large-v3` | *(STT Not Supported)* |
| **Default Chat Model** | `gpt-4o-mini` | `llama-3.3-70b-versatile` | `gemini-flash-latest` |
| **STT Endpoint** | `${baseUrl}/audio/transcriptions` | `${baseUrl}/audio/transcriptions` | N/A |
| **Chat Endpoint** | `${baseUrl}/chat/completions` | `${baseUrl}/chat/completions` | `${baseUrl}/v1beta/models/...:generateContent` |

---

## 4. Curl Examples for All Providers

### OpenAI (STT + Chat)

#### 1. Speech-to-Text (STT)
```bash
curl -X POST "https://api.openai.com/v1/audio/transcriptions" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@audio.webm" \
  -F "model=whisper-1" \
  -F "response_format=verbose_json"
```

#### 2. Chat Completion
```bash
curl -X POST "https://api.openai.com/v1/chat/completions" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "temperature": 0,
    "messages": [
      {
        "role": "system",
        "content": "Clean this text: Um hello world"
      }
    ]
  }'
```

---

### Groq (STT + Chat)

#### 1. Speech-to-Text (STT)
```bash
curl -X POST "https://api.groq.com/openai/v1/audio/transcriptions" \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@audio.webm" \
  -F "model=whisper-large-v3" \
  -F "response_format=verbose_json"
```

#### 2. Chat Completion
```bash
curl -X POST "https://api.groq.com/openai/v1/chat/completions" \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.3-70b-versatile",
    "temperature": 0,
    "messages": [
      {
        "role": "system",
        "content": "Clean this text: Um hello world"
      }
    ]
  }'
```

---

### Gemini (Native Google SDK / REST API)

This is what Whispo's **"Gemini"** provider uses under the hood:

```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Clean this text: Um hello world"
          }
        ]
      }
    ]
  }'
```

---

### Gemini (OpenAI Compatibility Endpoint)

Google also offers an OpenAI-compatible compatibility layer at `https://generativelanguage.googleapis.com/v1beta/openai`:

```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
  -H "Authorization: Bearer $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [
      {
        "role": "user",
        "content": "Say hello"
      }
    ]
  }'
```

> **Note**: Google's OpenAI compatibility endpoint only implements `/chat/completions` and `/embeddings`. It **does not** implement `/audio/transcriptions` for Whisper STT.

---

### Custom OpenAI-Compatible Providers

For local models (Ollama, LM Studio, vLLM) or alternative providers (OpenRouter, DeepSeek, Together AI):

#### Ollama (Local)
```bash
curl -X POST "http://localhost:11434/v1/chat/completions" \
  -H "Authorization: Bearer ollama" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2:latest",
    "messages": [
      {
        "role": "system",
        "content": "Clean this text: Um hello world"
      }
    ]
  }'
```

#### OpenRouter
```bash
curl -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.0-flash-001",
    "messages": [
      {
        "role": "system",
        "content": "Clean this text: Um hello world"
      }
    ]
  }'
```

---

## 5. The Mystery Solved: Why Gemini Failed with `/v1beta/openai` in Whispo

Here is the step-by-step breakdown of why `https://generativelanguage.googleapis.com/v1beta/openai` failed in Whispo, why it worked in curl, and why the "Gemini" provider worked:

### Scenario 1: You entered `https://generativelanguage.googleapis.com/v1beta/openai` in the "Gemini" Base URL box

- **What happened**: Whispo's "Gemini" provider uses `@google/generative-ai` (the native Google SDK).
- **The SDK expects**: A root Google Generative Language URL, defaulting to `https://generativelanguage.googleapis.com`.
- **The failure**: The Google SDK takes the `baseUrl` you provided and appends `/v1beta/models/<model>:generateContent`.
- **The resulting URL**:
  `https://generativelanguage.googleapis.com/v1beta/openai/v1beta/models/gemini-flash-latest:generateContent`
- **Result**: **404 Not Found**. The native Google SDK cannot communicate with the `/openai` adapter path.
- **Why default Gemini worked**: When you left the Base URL as default (`https://generativelanguage.googleapis.com` or blank), the SDK correctly contacted `https://generativelanguage.googleapis.com/v1beta/models/...:generateContent`.

---

### Scenario 2: You used Gemini's OpenAI compatibility endpoint in an OpenAI-compatible slot

When configuring an OpenAI-compatible slot with:
- **Base URL**: `https://generativelanguage.googleapis.com/v1beta/openai`
- **Chat Model**: `gemini-2.0-flash` (or `gemini-1.5-flash`, `gemini-3.5-flash`)
- **API Key**: `<Google Gemini API Key>`

You may encounter this error:
```json
{
  "error": {
    "code": 400,
    "message": "GenerateContentRequest.contents: contents is not specified\n",
    "status": "INVALID ARGUMENT"
  }
}
```

#### Why does this happen? (The `role: "system"` vs `contents` Problem)

1. **How Whispo sends chat completion requests:**
   In [src/main/llm.ts](file:///m:/mywhispo/whispo-extrasettings/src/main/llm.ts#L57-L63):
   ```typescript
   body: JSON.stringify({
     temperature: 0,
     model: config.openaiChatModel || "gpt-4o-mini",
     messages: [
       {
         role: "system",
         content: prompt,
       },
     ],
   })
   ```
   Whispo packages the entire prompt inside a single message with `"role": "system"`.

2. **How OpenAI and Groq handle this:**
   OpenAI and Groq fully allow requests where `messages` contains only a `system` prompt. They process it and return a completion.

3. **How Google Gemini's OpenAI adapter translates this:**
   Google's OpenAI compatibility layer translates OpenAI JSON into Gemini's internal `GenerateContentRequest`:
   - `role: "system"` is mapped to `GenerateContentRequest.system_instruction`.
   - `role: "user"` / `role: "assistant"` are mapped to `GenerateContentRequest.contents`.

   Because Whispo only sends a `system` message, Google populates `system_instruction` but leaves `contents` **completely empty**!
   Google's core API mandates that `contents` must never be empty in a `generateContent` call. When it sees no `user` message in `contents`, Google immediately rejects the request with:
   > `400 INVALID ARGUMENT: GenerateContentRequest.contents: contents is not specified`

---

### Scenario 3: Reproducing the Difference with Curl

#### ❌ The Failing Request (What Whispo sends - Solitary System Message):
```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GEMINI_API_KEY" \
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [
      {
        "role": "system",
        "content": "Clean this transcript: hello world"
      }
    ]
  }'
```
**Response (HTTP 400 Bad Request):**
```json
{
  "error": {
    "code": 400,
    "message": "GenerateContentRequest.contents: contents is not specified\n",
    "status": "INVALID ARGUMENT"
  }
}
```

#### ✅ The Working Request (What your curl sent - User Message):
```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GEMINI_API_KEY" \
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [
      {
        "role": "user",
        "content": "Clean this transcript: hello world"
      }
    ]
  }'
```
**Response (HTTP 200 OK):**
```json
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "content": "hello world",
        "role": "assistant"
      }
    }
  ]
}
```

#### ✅ Also Working (System Message + User Message):
```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GEMINI_API_KEY" \
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [
      {
        "role": "system",
        "content": "You are a transcript cleaner."
      },
      {
        "role": "user",
        "content": "hello world"
      }
    ]
  }'
```

---

### Scenario 4: How to Fix This in Whispo

There are two ways to resolve this in Whispo:

1. **Option A (Recommended): Use the Native "Gemini" Provider slot**
   - Set **Transcript Post-Processing** Provider to **Gemini**.
   - In Settings → Providers → **Gemini**:
     - Enter your Google Gemini API Key.
     - Leave Gemini Base URL blank or `https://generativelanguage.googleapis.com`.
     - Set Chat Model to `gemini-2.0-flash` or `gemini-flash-latest`.
   - This uses `@google/generative-ai` SDK, which constructs `contents` natively and does not suffer from OpenAI translation bugs.

2. **Option B: Update Whispo's `llm.ts` to use `role: "user"`**
   If you want OpenAI-compatible slots to support Gemini's `/openai` endpoint, change `messages` in `src/main/llm.ts` from `{ role: "system", content: prompt }` to `{ role: "user", content: prompt }`.


## 6. Quick Reference Table

| Setup Goal | Provider in Whispo | Base URL in Whispo | Chat Model in Whispo | API Key |
| :--- | :--- | :--- | :--- | :--- |
| **Standard OpenAI** | OpenAI | *(Leave blank or `https://api.openai.com/v1`)* | `gpt-4o-mini` | OpenAI Key (`sk-...`) |
| **Standard Groq** | Groq | *(Leave blank or `https://api.groq.com/openai/v1`)* | `llama-3.3-70b-versatile` | Groq Key (`gsk_...`) |
| **Standard Gemini (Recommended)** | Gemini | *(Leave blank or `https://generativelanguage.googleapis.com`)* | `gemini-2.0-flash` or `gemini-flash-latest` | Google AI Key (`AIza...`) |
| **Gemini via OpenAI Adapter** | OpenAI | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` *(Required!)* | Google AI Key (`AIza...`) |
| **Ollama (Local)** | OpenAI | `http://localhost:11434/v1` | `llama3.2` *(or installed model)* | `ollama` |
| **OpenRouter** | OpenAI | `https://openrouter.ai/api/v1` | `google/gemini-2.0-flash-001` | OpenRouter Key (`sk-or-...`) |

> [!TIP]
> When using Gemini in Whispo, always use the dedicated **Gemini** provider option in **Settings → General** (for transcript post-processing and text cleanup) and leave the Gemini Base URL blank or set to `https://generativelanguage.googleapis.com`.
