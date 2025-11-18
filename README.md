# Whispo

AI-powered dictation tool. Can choose models and LLM, openAI compatible

## Download

Windows x64.

[Releases](https://github.com/nandan121/whispo-extrasettings/releases/latest)

## Preview

![Img1](https://github.com/nandan121/whispo-extrasettings/blob/main/resources/Img1.png)

![Img2](https://github.com/nandan121/whispo-extrasettings/blob/main/resources/Img2.png)

https://github.com/user-attachments/assets/2344a817-f36c-42b0-9ebc-cdd6e926b7a0


## Features

- Hold `Ctrl` key to record your voice, release to transcribe it.
- Automatically insert the transcript into the application you are using.

- **Text Cleanup Feature**: Highlight text in any application, press a customizable shortcut (default: `Alt+Shift+C`), speak your cleanup command (e.g., "make this more formal"), and the AI will process and replace the text according to your instructions.
- Configurable cleanup shortcuts: `Alt+Shift+C`, `Ctrl+Shift+C`, or `Ctrl+Alt+C`
- Customizable cleanup prompts with `{selected_text}` and `{command}` placeholders
- Supports all major LLM providers (OpenAI, Groq, Gemini) for text processing

- Data is stored locally on your machine.
- Transcrbing with OpenAI Whisper (provided by OpenAI or Groq).
- Support **custom API URL** so you can use your own API to transcribe.
- Supports post-processing your transcript with LLMs (e.g. OpenAI, Groq and Gemini).

## License

[AGPL-3.0](./LICENSE)
