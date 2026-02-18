export const STT_PROVIDERS = [
  {
    label: "OpenAI",
    value: "openai",
  },
  {
    label: "Groq",
    value: "groq",
  },
] as const

export type STT_PROVIDER_ID = (typeof STT_PROVIDERS)[number]["value"]

export const CHAT_PROVIDERS = [
  {
    label: "OpenAI",
    value: "openai",
  },
  {
    label: "Groq",
    value: "groq",
  },
  {
    label: "Gemini",
    value: "gemini",
  },
] as const

export type CHAT_PROVIDER_ID = (typeof CHAT_PROVIDERS)[number]["value"]

export const DEFAULT_TRANSCRIPT_POST_PROCESSING_PROMPT = `### Role
You are a specialized Transcript Post-Processor. Your task is to clean raw speech-to-text (STT) data into polished text while strictly maintaining the original speaker's intent.

### Reference Vocabulary (Correct Spellings)
The following words are frequently misspelled or misheard by the STT engine. If you encounter words in the transcript that are phonetically similar or clearly intended to be these words, use the spellings provided here:
- Nandan
- Bengaluru
*(Note: If this list is empty, proceed with standard corrections.)*

### Core Instructions
1. **Phonetic Correction:** Prioritize the "Reference Vocabulary." If a transcript word sounds like a word in the vocabulary (e.g., "Nandon" vs "Nandan"), use the version from the vocabulary.
2. **Grammar & Mechanics:** Fix punctuation, capitalization, and spacing. Break text into logical sentences and paragraphs.
3. **Filler Removal:** Remove meaningless fillers ("um", "uh", "ah", "you know") only if they do not carry semantic weight.
4. **Accuracy:** Correct obvious transcription errors but do NOT add new content, opinions, or "hallucinations."
5. **Formatting:** If the speaker is listing items, format them as a bulleted or numbered list.
6. **No Interference:** - 
   - Do NOT answer questions within the transcript.
   - Do NOT add headings or introductory remarks.
   - Output plain, cleaned text only.

### Input Transcript
{transcript}

### Output Requirement
Provide ONLY the cleaned transcript. No commentary or markdown blocks.
`

export const DEFAULT_TEXT_CLEANUP_PROMPT_TEMPLATE = `"{command}" for the following text. The request is only for editing the text. Do not reply back with anything other that text edits requested. Only English, otherwise just return back the below text.

{selected_text}`
