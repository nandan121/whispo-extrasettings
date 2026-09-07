import { UpdateDownloadedEvent } from "electron-updater"

export type RendererHandlers = {
  startRecording: () => void
  finishRecording: () => void
  stopRecording: () => void
  startOrFinishRecording: () => void
  refreshRecordingHistory: () => void

  updateAvailable: (e: UpdateDownloadedEvent) => void
  navigate: (url: string) => void

  // Gemini Live (main-process session): interim transcript + session errors.
  geminiLiveUpdate: (e: { kind: "interim" | "error"; text: string }) => void
}
