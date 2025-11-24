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
- **Translation**: Translate foreign languages to English by setting the **Transcription Language** to "English" and speaking in any supported foreign language.

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
- **Transcription Settings**:
    - **Language Selection**: Choose from 58+ supported languages or use Auto-detect mode. Supports languages including English, Hindi, French, Spanish, German, Japanese, Chinese, Arabic, and many more.
        - ⚠️ **Note for Non-Latin Scripts**: When a specific language is selected for languages with non-Latin scripts (Hindi, Arabic, Chinese, etc.), transcription may be romanized (e.g., "Aap kaise hain?" instead of "आप कैसे हैं?"). For native script output, use **"Auto" (recommended)** which correctly detects and uses the appropriate script.
    - **Custom Words/Phrases**: Add domain-specific terms, technical vocabulary, or names to improve transcription accuracy. Examples: "ChatGPT, OpenAI, Groq, Whisper, Gemini, API".
        - **Toggle On/Off**: Enable "Use Custom Words" when speaking in the same language as your phrases (typically English). Disable it when switching to other languages to avoid romanization and get native script output.
        - ⚠️ **Best Practice for Silence/Hallucinations**: Using the "Custom Words" feature (Whisper prompt) can sometimes cause silence to be transcribed as gibberish or repetitive text. If you encounter this, we recommend **disabling "Use Custom Words"** and instead using the **Post-Processing Prompt** feature with a prompt like:
            > "Also, correct any misspelled names to these exact spellings: ChatGPT, OpenAI, Groq. Preserve all other text exactly as is."
            
            This approach fixes spellings without introducing hallucinations during silence.

### 👨‍💻 Developer Notes
- **Hallucination Patterns**: There is a list of known hallucination strings (e.g., "Thank you") defined in `src/main/tipc.ts`. These are used to filter out common Whisper hallucinations when using custom prompts. You can update this list in the code if you encounter other persistent hallucinations.


## 📋 Keyboard Shortcut Compatibility

### ⚠️ Important: Command Mode Shortcut Selection (Push-to-Talk Mode)

> [!WARNING]
> When using **Command Mode** with **Push-to-Talk (Hold) mode**, certain keyboard shortcuts may **fail to detect selected text** properly. This is due to a technical limitation with how the application detects selections.

#### Why This Happens

When you trigger Command Mode in push-to-talk mode:

1. You **press and hold** your shortcut (e.g., `Ctrl+Alt+/`)
2. After a 300ms delay, the app needs to check if you have text selected
3. To do this, it simulates **`Ctrl+C`** to copy any selected text
4. **Problem**: If your shortcut uses **multiple modifier keys** (Ctrl, Alt, Shift), they are **still being held down** when the app tries to simulate `Ctrl+C`
5. This causes the copy operation to be interpreted as a different key combination (e.g., `Ctrl+Alt+C` instead of `Ctrl+C`), which **fails to copy** the selected text

#### ✅ Recommended Shortcuts for Command Mode (Push-to-Talk)

**Best Options:**
- `Ctrl+F9` ✓ (Tested and working)
- `Ctrl+F10`, `Ctrl+F11`, `Ctrl+F12` ✓
- Any **`Ctrl+F[1-12]`** function key combination

**Alternative Options:**
- `Ctrl+[Number]` (e.g., `Ctrl+6`, `Ctrl+7`) ✓ - Both top-row and numpad numbers work
- `Ctrl+[Uncommon Letter]` (e.g., `Ctrl+J`, `Ctrl+K`) - Only if not used by your applications
- Single modifier combinations with rarely-used keys

> [!TIP]
> Number keys (0-9) work with **both** the top row number keys and the numpad keys. They are treated as equivalent, so `Ctrl+6` will trigger whether you press the top row 6 or numpad 6.

> [!NOTE]
> **NumLock must be enabled** for numpad keys to work as numbers. If NumLock is off, the numpad keys will register as navigation keys (e.g., `RightArrow`, `End`, `PageDown`) instead of numbers.

#### ❌ Shortcuts to Avoid for Command Mode (Push-to-Talk)

**Do NOT use shortcuts with multiple modifiers:**
- `Ctrl+Alt+[any key]` ✗ (e.g., `Ctrl+Alt+/`, `Ctrl+Alt+Space`)
- `Ctrl+Shift+[any key]` ✗ (e.g., `Ctrl+Shift+C`)
- `Alt+Shift+[any key]` ✗
- Any combination with 2+ modifier keys ✗

> [!NOTE]
> This limitation **only affects Command Mode in Push-to-Talk mode**. If you're using:
> - **Toggle mode** for Command Mode: All shortcuts work fine
> - **Regular dictation**: All shortcuts work fine
> - **Text Cleanup mode**: Most shortcuts work (e.g., `Ctrl+Alt` tested and working)

#### Tested Configurations

| Feature | Mode | Shortcut | Status |
|---------|------|----------|--------|
| Command Mode | Push-to-Talk | `Ctrl+F9` | ✅ Working |
| Command Mode | Push-to-Talk | `Ctrl+Alt+/` | ❌ Fails to detect selection |
| Regular Dictation | Push-to-Talk | `Ctrl+Alt` | ✅ Working |
| Text Cleanup | Toggle | `Ctrl+Shift+C` | ✅ Working |

#### Additional Resources

For more information about supported keyboard shortcuts, see: https://docs.wisprflow.ai/articles/5797030187-supported-unsupported-keyboard-hotkey-shortcuts 
## License

[AGPL-3.0](./LICENSE)
