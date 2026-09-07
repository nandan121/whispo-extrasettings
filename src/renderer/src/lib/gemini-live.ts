// ---------------------------------------------------------------------------
// Renderer-side live capture helpers (panel window).
//
// The Gemini Live WebSocket itself lives in the MAIN process
// (src/main/gemini-live.ts): Electron's Chromium network stack fails the
// handshake opaquely in some environments, while Node's WebSocket works.
// This module only captures mic audio as 16kHz mono PCM16 and base64-encodes
// chunks for IPC streaming via geminiLiveSendAudio.
// ---------------------------------------------------------------------------

export function floatTo16BitPCM(float32: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32.length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// ---------------------------------------------------------------------------
// Microphone → 16kHz mono PCM16 chunks. Uses a downsampling AudioContext +
// ScriptProcessorNode (deprecated but dependency-free and reliable inside
// Electron's Chromium; avoids AudioWorklet bundling through electron-vite).
// ---------------------------------------------------------------------------
export async function startMicPcmStream(
  onChunk: (pcm16: ArrayBuffer) => void,
  hooks?: { onLog?: (message: string) => void },
): Promise<() => void> {
  const log = (m: string) => {
    try {
      hooks?.onLog?.(m)
    } catch {
      // logging must never break capture
    }
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: "default",
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    },
    video: false,
  })
  log(
    `mic: tracks=${stream.getAudioTracks().map((t) => `${t.label || "?"}/${t.readyState}`).join(",") || "none"}`,
  )

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext
  const audioContext = new AudioCtx({ sampleRate: 16000 })
  log(`mic: context state=${audioContext.state} rate=${audioContext.sampleRate}`)
  // Pages woken by a global hotkey have no DOM gesture: the context starts
  // suspended and ScriptProcessor would never fire without an explicit resume.
  try {
    await audioContext.resume()
  } catch (e) {
    log(`mic: resume threw: ${e instanceof Error ? e.message : String(e)}`)
  }
  log(`mic: context state after resume=${audioContext.state}`)
  const source = audioContext.createMediaStreamSource(stream)
  // 4096 frames ≈ 256ms at 16kHz — good latency/overhead balance.
  const processor = audioContext.createScriptProcessor(4096, 1, 1)

  let chunks = 0
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0)
    chunks++
    if (chunks === 1 || chunks % 100 === 0) log(`mic: chunk#${chunks}`)
    onChunk(floatTo16BitPCM(input))
  }

  source.connect(processor)
  // ScriptProcessorNode only pulls audio while connected downstream — sink it
  // through zero gain so the mic is captured but NOT played back out of the
  // speakers (which would cause a feedback loop).
  const sink = audioContext.createGain()
  sink.gain.value = 0
  processor.connect(sink)
  sink.connect(audioContext.destination)

  return () => {
    try {
      source.disconnect()
      processor.disconnect()
      sink.disconnect()
    } catch {
      // ignore
    }
    try {
      void audioContext.close()
    } catch {
      // ignore
    }
    stream.getTracks().forEach((track) => track.stop())
  }
}
