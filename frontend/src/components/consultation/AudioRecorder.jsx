import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Mic, Pause, Play, RefreshCw, Send, Volume2 } from 'lucide-react'

/**
 * AudioRecorder.jsx - Acoustic Capture & Downsampling Pipeline
 *
 * Implements specifications:
 * 1. Web Audio API pipeline with hardware acoustic filtering (echoCancellation, noiseSuppression, autoGainControl).
 * 2. Real-time 16kHz mono downsampling with Float32 -> 16-bit Linear PCM (Int16Array) quantization.
 * 3. 50ms-100ms chunking cadence (2048 sample buffer = ~46-128ms) feeding useWebSocket.sendAudioChunk.
 * 4. Recording State Machine: IDLE -> RECORDING -> PAUSED -> PROCESSING.
 * 5. High-performance HTML5 <canvas> frequency-bar visualizer driven by a requestAnimationFrame loop
 *    — all draw calls happen imperatively on the canvas; zero React re-renders per frame.
 * 6. Primary Action CTAs: "Start Consultation", "Process Consultation", "New Patient (Reset)".
 */

// ─── Utility helpers ───────────────────────────────────────────────────────────

/** Downsamples Float32Array from hardware sampleRate to 16 000 Hz */
function downsampleTo16k(input, fromRate) {
  if (fromRate === 16000) return input
  const ratio = fromRate / 16000
  const newLength = Math.round(input.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const origIndex = Math.min(Math.round(i * ratio), input.length - 1)
    result[i] = input[origIndex]
  }
  return result
}

/** Converts Float32Array [-1, 1] samples to 16-bit signed Linear PCM (little-endian) */
function floatTo16BitPCM(floatSamples) {
  const pcm = new Int16Array(floatSamples.length)
  for (let i = 0; i < floatSamples.length; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return pcm.buffer
}

function micErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
      return 'Microphone permission block hai. Browser address bar ke lock icon se allow karein.'
    case 'NotFoundError':
      return 'Microphone nahi mila. Kripya microphone connect karein.'
    case 'NotReadableError':
      return 'Microphone kisi doosri application mein busy hai. Use band karein.'
    default:
      return err?.message || 'Recording start nahi ho payi.'
  }
}

const formatTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

// ─── Visualizer constants ──────────────────────────────────────────────────────
const BAR_COUNT = 48          // number of frequency bars drawn on canvas
const BAR_GAP = 2             // px gap between bars
const COLOR_NORMAL = '#2dd4bf' // teal-400
const COLOR_HIGH = '#f43f5e'  // rose-500
const COLOR_IDLE = '#1e293b'  // slate-800
const HIGH_THRESHOLD = 0.75   // fraction of bar height above which colour switches to red

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AudioRecorder({
  onStart,
  onChunk,
  onStop,
  onReset,
  disabled = false,
  isProcessing = false,
}) {
  // ---- 1. Recording State Machine: IDLE -> RECORDING -> PAUSED ----
  const [internalState, setInternalState] = useState('IDLE') // 'IDLE' | 'RECORDING' | 'PAUSED'
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)

  // Effective state accounts for parent isProcessing without cascading renders
  const recordingState = isProcessing ? 'PROCESSING' : internalState

  // ---- 2. Web Audio API refs (never stored in state → no re-render on update) ----
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)

  // Mirror of recordingState for use inside rAF closure (avoids stale closure)
  const stateRef = useRef('IDLE')
  useEffect(() => {
    stateRef.current = recordingState
  }, [recordingState])

  // ---- 3. Canvas ref for the high-performance visualizer ----
  const canvasRef = useRef(null)

  // ---- 4. Timer while recording ----
  useEffect(() => {
    if (recordingState !== 'RECORDING') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [recordingState])

  // ---- 5. Canvas draw helper (pure imperative — zero React re-renders) ----
  const drawFrame = useCallback((analyser, dataArray) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height

    // Clear
    ctx.clearRect(0, 0, W, H)

    const isRecording = stateRef.current === 'RECORDING'

    if (!isRecording) {
      // Draw flat idle bars
      const barW = (W - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT
      ctx.fillStyle = COLOR_IDLE
      for (let i = 0; i < BAR_COUNT; i++) {
        const x = i * (barW + BAR_GAP)
        ctx.fillRect(x, H - 4, barW, 4)
      }
      return
    }

    // Pull live frequency data from the AnalyserNode
    analyser.getByteFrequencyData(dataArray)

    const barW = (W - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT
    const step = Math.floor(dataArray.length / BAR_COUNT)

    for (let i = 0; i < BAR_COUNT; i++) {
      const freqValue = dataArray[i * step] ?? 0
      const fraction = freqValue / 255           // 0.0 – 1.0
      const barH = Math.max(4, fraction * H)     // minimum 4 px so bars are always visible
      const x = i * (barW + BAR_GAP)
      const y = H - barH

      // Gradient: teal for normal, rose for loud peaks
      ctx.fillStyle = fraction > HIGH_THRESHOLD ? COLOR_HIGH : COLOR_NORMAL
      ctx.globalAlpha = 0.9

      // Rounded top corners via path
      const r = Math.min(barW / 2, 3)
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + barW - r, y)
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r)
      ctx.lineTo(x + barW, H)
      ctx.lineTo(x, H)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
      ctx.fill()
    }

    ctx.globalAlpha = 1
  }, [])

  // ---- 6. rAF loop — starts when recording begins, stops when it pauses/stops ----
  const startVisualizerLoop = useCallback(
    (analyser) => {
      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const loop = () => {
        if (stateRef.current !== 'RECORDING') {
          // Draw one last idle frame and exit the loop
          drawFrame(analyser, dataArray)
          animationFrameRef.current = null
          return
        }
        drawFrame(analyser, dataArray)
        animationFrameRef.current = requestAnimationFrame(loop)
      }

      // Cancel any existing loop before starting a new one
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      animationFrameRef.current = requestAnimationFrame(loop)
    },
    [drawFrame],
  )

  // ---- 7. Full audio pipeline teardown & resource cleanup ----
  const stopAudioPipeline = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    // Draw idle state on canvas
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)
      const barW = (W - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT
      ctx.fillStyle = COLOR_IDLE
      for (let i = 0; i < BAR_COUNT; i++) {
        ctx.fillRect(i * (barW + BAR_GAP), H - 4, barW, 4)
      }
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => () => stopAudioPipeline(), [stopAudioPipeline])

  // Draw initial idle bars once canvas mounts
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const barW = (W - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT
    ctx.fillStyle = COLOR_IDLE
    for (let i = 0; i < BAR_COUNT; i++) {
      ctx.fillRect(i * (barW + BAR_GAP), H - 4, barW, 4)
    }
  }, [])

  // ---- 8. Acoustic Capture Initialization ----
  const startConsultation = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Is browser mein microphone access support nahi hai (HTTPS ya localhost zaroori hai).')
      return
    }

    try {
      // Hardware acoustic filters
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      await onStart?.()

      // Instantiate Web Audio API context
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const audioContext = new AudioCtx()
      audioContextRef.current = audioContext

      // Always resume — browsers suspend AudioContext until a user gesture
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const source = audioContext.createMediaStreamSource(stream)

      // AnalyserNode — higher fftSize = more frequency bins = richer bars
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256                // 128 usable bins — plenty for BAR_COUNT=48
      analyser.smoothingTimeConstant = 0.75 // slight temporal smoothing (0=raw, 1=frozen)
      analyserRef.current = analyser
      source.connect(analyser)

      // ScriptProcessor for PCM chunking (bufferSize 2048 ≈ 46 ms @ 44.1 kHz)
      const processor = audioContext.createScriptProcessor(2048, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (stateRef.current !== 'RECORDING') return
        const channelData = e.inputBuffer.getChannelData(0)
        const downsampled = downsampleTo16k(channelData, audioContext.sampleRate)
        const pcmBuffer = floatTo16BitPCM(downsampled)
        onChunk?.(pcmBuffer)
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      setSeconds(0)
      setInternalState('RECORDING')   // stateRef syncs via useEffect
      // Small delay so stateRef.current is 'RECORDING' before the first loop tick
      setTimeout(() => startVisualizerLoop(analyser), 0)
    } catch (err) {
      stopAudioPipeline()
      setError(micErrorMessage(err))
    }
  }

  const pauseRecording = () => {
    setInternalState('PAUSED')
    // Suspend AudioContext — also silences ScriptProcessor callbacks
    if (audioContextRef.current?.state === 'running') {
      audioContextRef.current.suspend()
    }
    // rAF loop will self-terminate on next tick because stateRef.current != 'RECORDING'
  }

  const resumeRecording = () => {
    setInternalState('RECORDING')
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume()
    }
    if (analyserRef.current) {
      setTimeout(() => startVisualizerLoop(analyserRef.current), 0)
    }
  }

  // Primary Action CTA: "Process Consultation"
  const processConsultation = () => {
    stopAudioPipeline()
    setInternalState('IDLE')
    onStop?.()
  }

  // Primary Action CTA: "New Patient (Reset)"
  const resetSession = () => {
    stopAudioPipeline()
    setInternalState('IDLE')
    setSeconds(0)
    onReset?.()
  }

  const isRecording = recordingState === 'RECORDING'
  const isPaused = recordingState === 'PAUSED'
  const isProcessActive = recordingState === 'PROCESSING'

  return (
    <section className="rounded-xl border border-slate-800 bg-panel p-5">
      {/* Header with Title and Consultation Clock */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Consultation Recording</h2>
          <span className="text-xs text-slate-400">
            {recordingState === 'IDLE' && 'Awaiting doctor initiation'}
            {isRecording && 'Live ambient speech stream active (16kHz PCM)'}
            {isPaused && 'Recording temporarily paused'}
            {isProcessActive && 'Extracting clinical findings with Evon LLM…'}
          </span>
        </div>
        <span className="font-mono text-2xl font-bold tabular-nums text-brand">
          {formatTime(seconds)}
        </span>
      </div>

      {/* ── Live Canvas Waveform Visualizer ── */}
      <div className="mt-4 rounded-lg border border-slate-800/80 bg-ink/70 p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 font-medium">
            <Volume2 size={14} className={isRecording ? 'text-brand' : 'text-slate-500'} />
            Acoustic Waveform
          </span>
          {isRecording ? (
            <span className="flex items-center gap-1.5 font-semibold text-rose-400">
              <span className="h-2 w-2 animate-ping rounded-full bg-rose-500" /> REC ACTIVE
            </span>
          ) : (
            <span className="text-slate-500">{isPaused ? 'Paused' : 'Muted'}</span>
          )}
        </div>

        {/*
          Canvas dimensions are set via HTML attributes (physical pixels).
          CSS width:100% stretches it to fill the container responsively.
          height:64px matches the h-16 visual slot.
        */}
        <canvas
          ref={canvasRef}
          width={800}
          height={64}
          className="block h-16 w-full rounded"
          aria-label="Live microphone frequency visualizer"
        />
      </div>

      {/* Primary Action CTAs */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {recordingState === 'IDLE' && (
          <button
            onClick={startConsultation}
            disabled={disabled || isProcessActive}
            className="flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-ink shadow-lg shadow-teal-500/20 transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Mic size={19} /> Start Consultation
          </button>
        )}

        {(isRecording || isPaused) && (
          <>
            {/* Process Consultation */}
            <button
              onClick={processConsultation}
              className="flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-ink shadow-lg shadow-teal-500/20 transition hover:bg-brand/90"
            >
              <Send size={18} /> Process Consultation
            </button>

            {/* Pause / Resume */}
            {isRecording ? (
              <button
                onClick={pauseRecording}
                className="flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5"
              >
                <Pause size={16} /> Pause
              </button>
            ) : (
              <button
                onClick={resumeRecording}
                className="flex items-center gap-2 rounded-full border border-brand/70 px-4 py-2.5 text-sm text-brand hover:bg-white/5"
              >
                <Play size={16} /> Resume
              </button>
            )}
          </>
        )}

        {/* New Patient (Reset) */}
        <button
          onClick={resetSession}
          disabled={isRecording}
          className="flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2.5 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-100 disabled:opacity-40"
        >
          <RefreshCw size={15} /> New Patient (Reset)
        </button>
      </div>

      {/* Acoustic Error Display */}
      {error && (
        <div
          role="alert"
          className="mt-4 flex gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
    </section>
  )
}
