import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Mic, Pause, Play, RefreshCw, Send, Volume2 } from 'lucide-react'

/**
 * AudioRecorder.jsx - Acoustic Capture & Downsampling Pipeline
 *
 * Implements specifications:
 * 1. Web Audio API pipeline with hardware acoustic filtering (echoCancellation, noiseSuppression, autoGainControl).
 * 2. Real-time 16kHz mono downsampling with Float32 -> 16-bit Linear PCM (Int16Array) quantization.
 * 3. 50ms-100ms chunking cadence (2048 sample buffer = ~46-128ms) feeding useWebSocket.sendAudioChunk.
 * 4. Recording State Machine: IDLE -> RECORDING -> PROCESSING.
 * 5. Live Audio Waveform / VU Meter powered by AnalyserNode.getByteFrequencyData() for visual mic verification.
 * 6. Primary Action CTAs: "Start Consultation", "Process Consultation", "New Patient (Reset)".
 */

// Downsamples input Float32Array from hardware sampleRate (e.g. 44.1k/48k) to 16,000 Hz
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

// Converts Float32Array [-1.0, 1.0] samples to 16-bit signed Linear PCM (little-endian byte buffer)
function floatTo16BitPCM(floatSamples) {
  const pcm = new Int16Array(floatSamples.length)
  for (let i = 0; i < floatSamples.length; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
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

export default function AudioRecorder({
  onStart,
  onChunk,
  onStop,
  onReset,
  disabled = false,
  isProcessing = false,
}) {
  // ---- 1. Recording State Machine: IDLE -> RECORDING -> PROCESSING ----
  const [internalState, setInternalState] = useState('IDLE') // 'IDLE' | 'RECORDING' | 'PAUSED'
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [vuLevels, setVuLevels] = useState(new Array(16).fill(0)) // 16 frequency bars for VU meter

  // Effective state accounts for parent isProcessing state without triggering cascading renders
  const recordingState = isProcessing ? 'PROCESSING' : internalState

  // Internal Web Audio API references
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const stateRef = useRef('IDLE')

  useEffect(() => {
    stateRef.current = recordingState
  }, [recordingState])

  // Timer while recording
  useEffect(() => {
    if (recordingState !== 'RECORDING') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [recordingState])

  // ---- 2. Audio Pipeline Teardown & Resource Cleanup ----
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
    setVuLevels(new Array(16).fill(0))
  }, [])

  useEffect(() => () => stopAudioPipeline(), [stopAudioPipeline])

  // ---- 3. Live Audio Waveform / VU Meter Animation Loop ----
  const startVuMeter = useCallback((analyser) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const updateMeter = () => {
      if (stateRef.current !== 'RECORDING') {
        setVuLevels(new Array(16).fill(0))
        return
      }

      analyser.getByteFrequencyData(dataArray)

      // Sample 16 discrete bands across the frequency spectrum
      const barCount = 16
      const step = Math.floor(dataArray.length / barCount)
      const newLevels = []
      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] || 0
        newLevels.push(Math.min(100, Math.round((val / 255) * 100)))
      }
      setVuLevels(newLevels)

      animationFrameRef.current = requestAnimationFrame(updateMeter)
    }

    updateMeter()
  }, [])

  // ---- 4. Acoustic Capture Initialization ----
  const startConsultation = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Is browser mein microphone access support nahi hai (HTTPS ya localhost zaroori hai).')
      return
    }

    try {
      // Hardware acoustic filters: echoCancellation, noiseSuppression, autoGainControl
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

      // Instantiates Web Audio API context
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const audioContext = new AudioCtx()
      audioContextRef.current = audioContext

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const source = audioContext.createMediaStreamSource(stream)

      // AnalyserNode for live VU meter frequency analysis
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser
      source.connect(analyser)

      // Slicing & Cadence: bufferSize 2048 gives ~46ms at 44.1k/48k or ~128ms at 16k
      const processor = audioContext.createScriptProcessor(2048, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (stateRef.current !== 'RECORDING') return
        const channelData = e.inputBuffer.getChannelData(0)
        // Downsample to standard 16kHz
        const downsampled = downsampleTo16k(channelData, audioContext.sampleRate)
        // Quantize to 16-bit signed Linear PCM
        const pcmBuffer = floatTo16BitPCM(downsampled)
        onChunk?.(pcmBuffer)
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      setSeconds(0)
      setInternalState('RECORDING')
      startVuMeter(analyser)
    } catch (err) {
      stopAudioPipeline()
      setError(micErrorMessage(err))
    }
  }

  const pauseRecording = () => {
    setInternalState('PAUSED')
    if (audioContextRef.current?.state === 'running') {
      audioContextRef.current.suspend()
    }
  }

  const resumeRecording = () => {
    setInternalState('RECORDING')
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume()
    }
    if (analyserRef.current) {
      startVuMeter(analyserRef.current)
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

      {/* Live Audio Waveform / VU Meter */}
      <div className="mt-4 rounded-lg border border-slate-800/80 bg-ink/70 p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 font-medium">
            <Volume2 size={14} className={isRecording ? 'text-brand' : 'text-slate-500'} />
            Acoustic Waveform / VU Meter
          </span>
          {isRecording ? (
            <span className="flex items-center gap-1.5 font-semibold text-rose-400">
              <span className="h-2 w-2 animate-ping rounded-full bg-rose-500" /> REC ACTIVE
            </span>
          ) : (
            <span className="text-slate-500">Muted</span>
          )}
        </div>

        {/* 16-Band Visualizer Bars */}
        <div className="flex h-12 items-end justify-between gap-1 px-1">
          {vuLevels.map((level, idx) => {
            const height = isRecording ? Math.max(8, level) : 6
            const isHigh = level > 75
            return (
              <div
                key={idx}
                className="flex-1 rounded-t transition-all duration-75"
                style={{
                  height: `${height}%`,
                  backgroundColor: !isRecording
                    ? '#334155'
                    : isHigh
                      ? '#f43f5e'
                      : '#2dd4bf',
                  opacity: isRecording ? 0.9 : 0.3,
                }}
              />
            )
          })}
        </div>
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
            {/* Primary Action CTA: Process Consultation */}
            <button
              onClick={processConsultation}
              className="flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-ink shadow-lg shadow-teal-500/20 transition hover:bg-brand/90"
            >
              <Send size={18} /> Process Consultation
            </button>

            {/* Secondary Controls: Pause / Resume */}
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

        {/* New Patient (Reset) CTA */}
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
