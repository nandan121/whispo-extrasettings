# Whispo

**AI-powered dictation tool.** Use your voice to type anywhere, with support for OpenAI, Groq, and Gemini models.

## Download

**Windows x64**
[Latest Release](https://github.com/nandan121/whispo-extrasettings/releases/latest)

## Preview

![Img1](https://github.com/nandan121/whispo-extrasettings/blob/main/resources/Img1.png)
![Img2](https://github.com/nandan121/whispo-extrasettings/blob/main/resources/Img2.png)

https://github.com/user-attachments/assets/2344a817-f36c-42b0-9ebc-cdd6e926b7a0

## Features

### 🎙️ Smart Dictation
- **Universal Typing**: Automatically inserts transcribed text into any active application.
- **Flexible Shortcuts**:
    - **Customizable Keys**: Set any key combination (e.g., `Ctrl`, `Alt+Space`, `F1`) as your recording trigger.
    - **Modifier-Only Support**: Use single modifier keys like `Ctrl`, `Shift`, or `Alt` for quick access.
    - **Dual Modes**:
        - **Push to Talk (Hold)**: Hold the key to record, release to transcribe. Includes a smart delay to prevent accidental triggers.
        - **Toggle**: Press once to start recording, press again to stop.
- **Cancel Anytime**: Press `Esc` to instantly cancel the current recording.

### ✨ AI Text Cleanup
- **Contextual Editing**: Highlight text in any app and use the cleanup shortcut (default: `Ctrl+Shift+C`) to modify it.
- **Voice Commands**: Speak instructions like "make this more formal" or "fix grammar" to process the selected text.
- **Customizable Prompts**: Configure your own system prompts using `{selected_text}` and `{command}` placeholders.

### 🚀 Command Mode
When you trigger the cleanup shortcut **without selecting any text**, Whispo enters **Command Mode**. This allows you to execute voice commands, open URLs, or launch applications.

- **Prefix-Based Commands**: Define commands that trigger specific actions.
    - **Example**: Map "Perplexity" to `https://www.perplexity.ai/search/new?q={command}`.
    - **Usage**: Say "Perplexity best restaurants in Tokyo" -> Opens Perplexity search.
- **Variable Substitution**: Use `{command}` in your action string to insert the rest of your spoken phrase.
- **Smart Fallbacks**:
    1.  **Prefix Match**: Checks if your speech starts with a defined command prefix.
    2.  **URL Detection**: If you say "http..." or "https...", it opens the URL directly.
    3.  **Default Command**: If configured (e.g., Perplexity), it passes your entire speech to the default action.
    4.  **System Command**: Tries to execute your speech as a system command or path.

#### Examples
| Type | Spoken Command | Action / Configuration | Result |
| :--- | :--- | :--- | :--- |
| **Search** | "Perplexity weather" | Prefix: `Perplexity` <br> Action: `https://www.perplexity.ai/search?q={command}` | Opens Perplexity with "weather" |
| **URL** | "https://google.com" | *No configuration needed* | Opens Google |
| **App Launch** | "notepad" | *System Command Fallback* | Opens Notepad |
| **Path (Env Var)** | "%windir%\system32\mspaint.exe" | *System Command Fallback* | Opens Paint |
| **Path (Absolute)** | "C:\Windows\System32\mspaint.exe" | *System Command Fallback* | Opens Paint |


### ⚙️ Powerful Configuration
- **Local Privacy**: Data is stored locally on your machine.
- **Model Support**:
    - **Transcription**: Uses OpenAI Whisper (via OpenAI or Groq API).
    - **LLM Processing**: Supports OpenAI, Groq, and Gemini for text post-processing.
- **Custom API**: Option to use your own custom API URL for transcription services.

### Other Notes
https://docs.wisprflow.ai/articles/5797030187-supported-unsupported-keyboard-hotkey-shortcuts could help to know about what shortcuts may be helpful

## License

[AGPL-3.0](./LICENSE)
