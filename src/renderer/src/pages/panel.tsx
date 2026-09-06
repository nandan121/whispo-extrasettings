import { Spinner } from "@renderer/components/ui/spinner"
import { Recorder } from "@renderer/lib/recorder"
import { playSound } from "@renderer/lib/sound"
import { cn } from "@renderer/lib/utils"
import {
  arrayBufferToBase64,
  startMicPcmStream,
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
  const [liveStatus, setLiveStatus] = useState("")
  const isConfirmedRef = useRef(false)
  const startingRef = useRef(false)
  // Release ("finish"/"cancel") that landed while startRecordingAuto was still
  // awaiting getConfig/connect: torn down as soon as init resolves so a quick
  // tap can't leave the panel stuck in recording mode.
  const pendingStopRef = useRef<"finish" | "cancel" | null>(null)
  const liveRef = useRef<{
    stopMic: () => void
    startTime: number
  } | null>(null)
  // Last live session failure detail (transcriber.lastError mirror for the
  // empty-transcript branch: error → dialog, silence → quiet hide).
  const liveErrorRef = useRef<string | null>(null)

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

  // Fire-and-forget: renderer live diagnostics → main log ([GEMINI-LIVE-R]).
  const liveLog = (message: string) => {
    tipcClient.geminiLiveLog({ message }).catch(() => {})
  }

  const recorderRef = useRef<Recorder | null>(null)

  // --- Gemini Live path (AI Studio key, true streaming) -------------------
  // The recording indicator (tray + visualizer + status) is set BEFORE
  // connecting so a slow/failed connection never looks like "nothing".
  // Mic capture starts IN PARALLEL with the WebSocket handshake: awaiting the
  // handshake first would clip the first ~0.5-1s of speech. Chunks captured
  // while connecting are buffered and flushed in order once connected.
  const startLiveRecording = async () => {
    // Instant indicator: tray + red bars + status line.
    setRecording(true)
    setLiveInterim("")
    setLiveStatus("Connecting…")
    liveErrorRef.current = null
    tipcClient.recordEvent({ type: "start" })

    const fail = (error: unknown) => {
      console.error("[GEMINI-LIVE]", error)
      liveRef.current = null
      pendingStopRef.current = null
      setRecording(false)
      setLiveStatus("")
      setVisualizerData(() => getInitialVisualizerData())
      tipcClient.recordEvent({ type: "end" })
      tipcClient.hidePanelWindow()
      tipcClient.displayError({
        title: error instanceof Error ? error.name : "Error",
        message:
          error instanceof Error ? error.message : "Live transcription failed",
      })
    }

    const micStartTime = Date.now()
    const pendingChunks: ArrayBuffer[] = []
    let sessionReady = false
    const pushChunk = (pcm16: ArrayBuffer) => {
      // Level meter stays live even while the handshake is in flight.
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
      if (!sessionReady) {
        pendingChunks.push(pcm16)
        return
      }
      // Stream audio to the main-process session.
      tipcClient
        .geminiLiveSendAudio({ chunk: arrayBufferToBase64(pcm16) })
        .catch(() => {})
    }
    const micPromise = startMicPcmStream(pushChunk, {
      onLog: (m) => liveLog(m),
    })

    // The main process owns the API key and the Live WebSocket (Node
    // transport) and reads the config itself; interim text arrives via
    // the geminiLiveUpdate handler.
    try {
      liveLog("panel: starting main live session")
      await tipcClient.geminiLiveStart()
    } catch (error) {
      // Handshake failed: stop mic capture that may already be running.
      micPromise.then(
        (stop) => {
          try {
            stop()
          } catch {
            // ignore
          }
        },
        () => {},
      )
      fail(error)
      return
    }

    let stopMic: () => void
    try {
      stopMic = await micPromise
    } catch (error) {
      tipcClient.geminiLiveAbort().catch(() => {})
      fail(error)
      return
    }

    // Flush audio captured during the handshake, in order. This block is
    // synchronous so no live chunk can overtake the buffered ones.
    const buffered = pendingChunks.splice(0)
    sessionReady = true
    for (const buf of buffered) {
      tipcClient
        .geminiLiveSendAudio({ chunk: arrayBufferToBase64(buf) })
        .catch(() => {})
    }
    liveRef.current = { stopMic, startTime: micStartTime }
    setLiveStatus("Listening…")
    liveLog(
      `panel: live session streaming (flushed ${buffered.length} buffered chunks)`,
    )

    // A release arrived while connecting: tear down immediately instead of
    // getting stuck in recording mode.
    const pending = pendingStopRef.current
    pendingStopRef.current = null
    if (pending === "finish") {
      await finishLiveRecording().catch((error) => {
        tipcClient.hidePanelWindow()
        tipcClient.displayError({
          title: error instanceof Error ? error.name : "Error",
          message:
            error instanceof Error
              ? error.message
              : "Live transcription failed",
        })
      })
    } else if (pending === "cancel") {
      cancelLiveRecording()
    }
  }

  const finishLiveRecording = async () => {
    const live = liveRef.current
    liveRef.current = null
    if (!live) return
    const duration = Date.now() - live.startTime
    liveLog(`panel: finish duration=${duration}`)
    setRecording(false)
    setVisualizerData(() => getInitialVisualizerData())
    tipcClient.recordEvent({ type: "end" })

    live.stopMic()
    await playSound("end_record")
    setLiveStatus("Transcribing…")
    let transcript = ""
    try {
      const result = await tipcClient.geminiLiveStop()
      transcript = result.transcript
    } catch (error) {
      setLiveStatus("")
      setLiveInterim("")
      tipcClient.hidePanelWindow()
      tipcClient.displayError({
        title: error instanceof Error ? error.name : "Error",
        message:
          error instanceof Error ? error.message : "Live transcription failed",
      })
      return
    }

    if (transcript.trim().length === 0 || duration < 1000) {
      const sessionError = liveErrorRef.current
      setLiveInterim("")
      setLiveStatus("")
      if (sessionError) {
        // Errored session: say exactly what failed.
        tipcClient.hidePanelWindow()
        tipcClient.displayError({
          title: "Gemini Live error",
          message: sessionError,
        })
        return
      }
      // Healthy but silent session: drop quietly, like the file path.
      console.log("Live recording too short or empty, ignoring")
      tipcClient.hidePanelWindow()
      return
    }
    setLiveInterim("")
    setLiveStatus("")
    liveLog(`panel: saving live transcript len=${transcript.length}`)
    liveTranscribeMutation.mutate({ transcript, duration })
  }

  const cancelLiveRecording = () => {
    const live = liveRef.current
    liveRef.current = null
    if (!live) return
    liveLog("panel: cancel")
    live.stopMic()
    tipcClient.geminiLiveAbort().catch(() => {})
    setRecording(false)
    setLiveInterim("")
    setLiveStatus("")
    liveErrorRef.current = null
    setVisualizerData(() => getInitialVisualizerData())
    tipcClient.recordEvent({ type: "end" })
  }

  const startRecordingAuto = async () => {
    // Guard the async gap: rapid toggle presses must not double-start.
    if (startingRef.current || liveRef.current) return
    startingRef.current = true
    try {
      setVisualizerData(() => getInitialVisualizerData())
      const config = await tipcClient.getConfig()
      const provider = config.sttProviderId || "groq"
      liveLog(`panel: start provider=${provider}`)
      if (provider === "gemini-live") {
        await startLiveRecording()
        return
      }
      recorderRef.current?.startRecording()
      // A release arrived during getConfig: stop immediately so a quick tap
      // can't leave the file-path recorder running with no stop event.
      // isConfirmedRef was already set by the listener that parked this.
      const pending = pendingStopRef.current
      if (pending) {
        pendingStopRef.current = null
        recorderRef.current?.stopRecording()
      }
    } catch (error) {
      tipcClient.hidePanelWindow()
      tipcClient.displayError({
        title: error instanceof Error ? error.name : "Error",
        message:
          error instanceof Error ? error.message : "Failed to start recording",
      })
    } finally {
      startingRef.current = false
    }
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
    // Interim text + session errors from the main-process live session.
    // Only applies while a live recording is active; stale updates (e.g.
    // from a previous session's teardown) are ignored.
    const unlisten = rendererHandlers.geminiLiveUpdate.listen((update) => {
      if (!liveRef.current) return
      if (update.kind === "interim") {
        setLiveInterim(update.text)
        setLiveStatus((s) => (s === "Connecting…" ? "Listening…" : s))
      } else {
        console.error("[GEMINI-LIVE]", update.text)
        liveErrorRef.current = update.text
        setLiveStatus(update.text.slice(0, 120))
      }
    })

    return unlisten
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
      // Release landed while connecting: park it so the session tears down
      // as soon as initialization resolves (avoids stuck recording).
      if (startingRef.current) {
        pendingStopRef.current = "finish"
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
      // Cancel landed while connecting: park it like the finish path.
      if (startingRef.current) {
        pendingStopRef.current = "cancel"
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
      } else if (startingRef.current) {
        // Toggle pressed while connecting: treat as a release.
        isConfirmedRef.current = true
        pendingStopRef.current = "finish"
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
          {(liveInterim || liveStatus) && (
            <div className="truncate text-xs text-neutral-500 dark:text-neutral-300">
              {liveInterim || liveStatus}
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
