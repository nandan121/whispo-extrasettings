import EventEmitter from "./event-emitter"
import { playSound } from "./sound"

const MIN_DECIBELS = -45

const logTime = (label: string) => {
  let time = performance.now()
  console.log(`${label} started at`, time)

  return (step: string) => {
    const now = performance.now()
    console.log(`${label} / ${step} took`, now - time)
    time = now
  }
}

const calculateRMS = (data: Uint8Array) => {
  let sumSquares = 0
  for (let i = 0; i < data.length; i++) {
    const normalizedValue = (data[i] - 128) / 128 // Normalize the data
    sumSquares += normalizedValue * normalizedValue
  }
  return Math.sqrt(sumSquares / data.length)
}

const normalizeRMS = (rms: number) => {
  rms = rms * 10
  const exp = 1.5 // Adjust exponent value; values greater than 1 expand larger numbers more and compress smaller numbers more
  const scaledRMS = Math.pow(rms, exp)

  // Scale between 0.01 (1%) and 1.0 (100%)
  return Math.min(1.0, Math.max(0.01, scaledRMS))
}

export class Recorder extends EventEmitter<{
  "record-start": []
  "record-end": [Blob, number]
  "visualizer-data": [number]
  destroy: []
}> {
  stream: MediaStream | null = null
  mediaRecorder: MediaRecorder | null = null

  constructor() {
    super()
  }

  analyseAudio(stream: MediaStream) {
    let processFrameTimer: number | null = null

    const audioContext = new AudioContext()
    const audioStreamSource = audioContext.createMediaStreamSource(stream)

    const analyser = audioContext.createAnalyser()
    analyser.minDecibels = MIN_DECIBELS
    audioStreamSource.connect(analyser)

    const bufferLength = analyser.frequencyBinCount

    const domainData = new Uint8Array(bufferLength)
    const timeDomainData = new Uint8Array(analyser.fftSize)

    const animate = (fn: () => void) => {
      processFrameTimer = requestAnimationFrame(fn)
    }

    const detectSound = () => {
      const processFrame = () => {
        analyser.getByteTimeDomainData(timeDomainData)
        analyser.getByteFrequencyData(domainData)

        // Calculate RMS level from time domain data
        const rmsLevel = calculateRMS(timeDomainData)
        const rms = normalizeRMS(rmsLevel)

        this.emit("visualizer-data", rms)

        animate(processFrame)
      }

      animate(processFrame)
    }

    detectSound()

    return () => {
      processFrameTimer && cancelAnimationFrame(processFrameTimer)
      audioStreamSource.disconnect()
      audioContext.close()
    }
  }

  async startRecording() {
    this.stopRecording()

    const log = logTime("startRecording")

    // Enable native noise suppression to reduce initialization artifacts
    const stream = (this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: "default",
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      },
      video: false,
    }))

    log("getUserMedia")

    const mediaRecorder = (this.mediaRecorder = new MediaRecorder(stream, {
      audioBitsPerSecond: 128e3,
    }))
    log("new MediaRecorder")

    let audioChunks: Blob[] = []
    let startTime = Date.now()

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data)
    }
    
    mediaRecorder.onstop = async () => {
      const duration = Date.now() - startTime
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType })

      this.emit("record-end", blob, duration)

      audioChunks = []
    }

    // This callback fires when recording ACTUALLY starts
    mediaRecorder.onstart = () => {
      log("mediaRecorder.onstart - recording actually started")
      
      // Now set the actual start time
      startTime = Date.now()
      
      // Emit record-start event to update UI (shows red/white dots)
      this.emit("record-start")
      
      // Start audio analysis for visualizer
      const stopAnalysing = this.analyseAudio(stream)
      this.once("destroy", stopAnalysing)
    }

    // Play the start sound BEFORE starting the recorder
    await playSound("begin_record")
    log("played begin_record sound")
    
    // Start recording (without timeslice to keep WebM container intact)
    // The onstart callback above will fire when recording actually begins
    mediaRecorder.start()
    log("mediaRecorder.start() called - waiting for onstart")
  }

  stopRecording() {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop()
      this.mediaRecorder = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }


    this.emit("destroy")

  }
}
