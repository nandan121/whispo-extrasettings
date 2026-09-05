import { Spinner } from "@renderer/components/ui/spinner"
import { Recorder } from "@renderer/lib/recorder"
import { playSound } from "@renderer/lib/sound"
import { cn } from "@renderer/lib/utils"
import {
  GEMINI_LIVE_DEFAULT_MODEL,
  GeminiLiveTranscriber,
  startMicPcmStream,
  toGeminiCustomVocabulary,
  toGeminiLanguageCodes,
} from "@renderer/lib/gemini-live"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { rendererHandlers, tipcClient } from "~/lib/tipc-client"

const VISUALIZER_BUFFER_LENGTH = 70

const getInitialVisualizerData = () =>
  Array<number>(VISUALIZER_BUFFER_LENGTH).fill(-1000)

export function Component() {
  const [visualizerData, setVisualizerData] = useState(() =>
    getInitialVisualizerData(),
  )
  const [recording, setRecording] = useState(false)
  const [liveInterim, setLiveInterim] = useState("")
  const isConfirmedRef = useRef(false)
  const liveRef = useRef<{
    transcriber: GeminiLiveTranscriber
    stopMic: () => void
    startTime: number
  } | null>(null)

  const transcribeMutation = useMutation({
    mutationFn: async ({
      blob,
      duration,
    }: {
      blob: Blob
      duration: number
    }) => {
      await tipcClient.createRecording({
        recording: await blob.arrayBuffer(),
        duration,
      })
    },
    onError(error) {
      tipcClient.hidePanelWindow()
      tipcClient.displayError({
        title: error.name,
        message: error.message,
      })
    },
  })

  const liveTranscribeMutation = useMutation({
    mutationFn: async ({
      transcript,
      duration,
    }: {
      transcript: string
      duration: number
    }) => {
      await tipcClient.saveLiveTranscription({ transcript, duration })
    },
    onError(error) {
      tipcClient.hidePanelWindow()
      tipcClient.displayError({
        title: error.name,
        message: error.message,
      })
    },
  })

  const isBusy = transcribeMutation.isPending || liveTranscribeMutation.isPending

  const recorderRef = useRef<Recorder | null>(null)

  // --- Gemini Live path (AI Studio key, true streaming) -------------------
  const startLiveRecording = async () => {
    const config = await tipcClient.getConfig()
    const apiKey = config.geminiApiKey || ""
    if (!apiKey) {
      throw new Error(
        'Gemini API key is required. Add your AI Studio key in Settings → Providers → Gemini ("Get API key" at aistudio.google.com).',
      )
    }

    const transcriber = new GeminiLiveTranscriber({
      onInterim: (text) => setLiveInterim(text),
      onError: (message) => {
        console.error("[GEMINI-LIVE]", message)
      },
    })
    await transcriber.connect({
      apiKey,
      model: config.geminiLiveSttModel || GEMINI_LIVE_DEFAULT_MODEL,
      languageCodes: toGeminiLanguageCodes(config.transcriptionLanguage),
      customVocabulary: toGeminiCustomVocabulary(
        config.transcriptionPrompt,
        config.transcriptionPromptEnabled,
      ),
    })

    const startTime = Date.now()
    const stopMic = await startMicPcmStream((pcm16) => {
      // Feed audio to Gemini + a cheap level meter for the visualizer.
      transcriber.sendPcm16Chunk(pcm16)
      const view = new Int16Array(pcm16)
      let peak = 0
      for (let i = 0; i < view.length; i += 8) {
        const a = Math.abs(view[i])
        if (a > peak) peak = a
      }
      const rms = Math.min(1, Math.max(0.01, peak / 12000))
      setVisualizerData((prev) => {
        const data = [...prev, rms]
        if (data.length > VISUALIZER_BUFFER_LENGTH) data.shift()
        return data
      })
    })

    liveRef.current = { transcriber, stopMic, startTime }
    setLiveInterim("")
    setRecording(true)
    tipcClient.recordEvent({ type: "start" })
  }

  const finishLiveRecording = async () => {
    const live = liveRef.current
    liveRef.current = null
    if (!live) return
    const duration = Date.now() - live.startTime
    setRecording(false)
    setVisualizerData(() => getInitialVisualizerData())
    tipcClient.recordEvent({ type: "end" })

    live.stopMic()
    await playSound("end_record")
    const transcript = await live.transcriber.finish()

    if (transcript.trim().length === 0 || duration < 1000) {
      console.log("Live recording too short or empty, ignoring")
      setLiveInterim("")
      return
    }
    setLiveInterim("")
    liveTranscribeMutation.mutate({ transcript, duration })
  }

  const cancelLiveRecording = () => {
    const live = liveRef.current
    liveRef.current = null
    if (!live) return
    live.stopMic()
    live.transcriber.close()
    setRecording(false)
    setLiveInterim("")
    setVisualizerData(() => getInitialVisualizerData())
    tipcClient.recordEvent({ type: "end" })
  }

  const startRecordingAuto = async () => {
    setVisualizerData(() => getInitialVisualizerData())
    try {
      const config = await tipcClient.getConfig()
      if ((config.sttProviderId || "groq") === "gemini-live") {
        await startLiveRecording()
        return
      }
    } catch (error) {
      tipcClient.hidePanelWindow()
      tipcClient.displayError({
        title: error instanceof Error ? error.name : "Error",
        message:
          error instanceof Error ? error.message : "Failed to start recording",
      })
      return
    }
    recorderRef.current?.startRecording()
  }
  // ------------------------------------------------------------------------

  useEffect(() => {
    if (recorderRef.current) return

    const recorder = (recorderRef.current = new Recorder())

    recorder.on("record-start", () => {
      setRecording(true)
      tipcClient.recordEvent({ type: "start" })
    })

    recorder.on("visualizer-data", (rms) => {
      setVisualizerData((prev) => {
        const data = [...prev, rms]

        if (data.length > VISUALIZER_BUFFER_LENGTH) {
          data.shift()
        }

        return data
      })
    })

    recorder.on("record-end", (blob, duration) => {
      setRecording(false)
      setVisualizerData(() => getInitialVisualizerData())
      tipcClient.recordEvent({ type: "end" })

      if (!isConfirmedRef.current) return

      if (blob.size === 0 || duration < 1000) {
        console.log("Recording too short or empty, ignoring")
        return
      }

      playSound("end_record")
      transcribeMutation.mutate({
        blob,
        duration,
      })
    })
  }, [])

  useEffect(() => {
    const unlisten = rendererHandlers.startRecording.listen(() => {
      startRecordingAuto()
    })

    return unlisten
  }, [])

  useEffect(() => {
    const unlisten = rendererHandlers.finishRecording.listen(() => {
      isConfirmedRef.current = true
      if (liveRef.current) {
        finishLiveRecording().catch((error) => {
          tipcClient.hidePanelWindow()
          tipcClient.displayError({
            title: error instanceof Error ? error.name : "Error",
            message:
              error instanceof Error
                ? error.message
                : "Live transcription failed",
          })
        })
        return
      }
      recorderRef.current?.stopRecording()
    })

    return unlisten
  }, [])

  useEffect(() => {
    const unlisten = rendererHandlers.stopRecording.listen(() => {
      isConfirmedRef.current = false
      if (liveRef.current) {
        cancelLiveRecording()
        return
      }
      recorderRef.current?.stopRecording()
    })

    return unlisten
  }, [])

  useEffect(() => {
    const unlisten = rendererHandlers.startOrFinishRecording.listen(() => {
      if (recording || liveRef.current) {
        isConfirmedRef.current = true
        if (liveRef.current) {
          finishLiveRecording().catch((error) => {
            tipcClient.hidePanelWindow()
            tipcClient.displayError({
              title: error instanceof Error ? error.name : "Error",
              message:
                error instanceof Error
                  ? error.message
                  : "Live transcription failed",
            })
          })
          return
        }
        recorderRef.current?.stopRecording()
      } else {
        tipcClient.showPanelWindow()
        startRecordingAuto()
      }
    })

    return unlisten
  }, [recording])

  return (
    <div className="flex h-screen dark:text-white">
      {isBusy ? (
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex h-full w-full flex-col justify-center rounded-xl px-2 transition-colors">
          {liveInterim && (
            <div className="truncate text-xs text-neutral-500 dark:text-neutral-300">
              {liveInterim}
            </div>
          )}
          <div className="flex h-6 w-full rounded-xl transition-colors">
            <div className="flex shrink-0"></div>
            <div
              className="relative flex grow items-center overflow-hidden"
              dir="rtl"
            >
              <div className="absolute right-0 flex h-6 items-center gap-0.5">
                {visualizerData
                  .slice()
                  .reverse()
                  .map((rms, index) => {
                    return (
                      <div
                        key={index}
                        className={cn(
                          "h-full w-0.5 shrink-0 rounded-lg",
                          "bg-red-500 dark:bg-white",
                          rms === -1000 && "bg-neutral-400 dark:bg-neutral-500",
                        )}
                        style={{
                          height: `${Math.min(100, Math.max(16, rms * 100))}%`,
                        }}
                      />
                    )
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
