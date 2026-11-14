import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Mic, Pause, Play, RotateCcw, Check } from 'lucide-react'

/**
 * AudioRecorder.jsx – Calm Clinical Acoustic Intake
 * Strict Contract Preservation: 16kHz downsampled linear PCM streaming over Web Audio API.
 */

// Human-readable message for browser microphone access errors (Sentence case)
function micErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError': return 'Microphone permission blocked. Please allow access.'
    case 'NotFoundError':   return 'No microphone found on this device.'
    case 'ReadableError':
    case 'NotReadableError':return 'Microphone is busy in another program.'
    default:                return err?.message || 'Recording could not start.'
  }
}

const WORKLET_NAME = 'pcm-worklet-processor'

const WORKLET_CODE = `
class PcmWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.targetSampleRate = 16000
    this.sourceRatio = sampleRate / 16000
    this.phase = 1.0
    this.prevSample = 0
    this.pcmBuffer = new Int16Array(512)
    this.pcmIndex = 0

    this.vadThreshold = 0.0035
    this.hangoverMax = 20
    this.hangoverCount = 0
    this.preRollBuffer = null
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0] || input[0].length === 0) return true
    const channelData = input[0]
    const len = channelData.length
    const ratio = this.sourceRatio
    let t = this.phase

    while (t < len) {
      const i0 = Math.floor(t)
      const frac = t - i0
      const s0 = i0 === 0 ? this.prevSample : channelData[i0 - 1]
      const s1 = channelData[i0]
      const interpolated = s0 + frac * (s1 - s0)

      const clamped = Math.max(-1, Math.min(1, interpolated))
      const pcmVal = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
      this.pcmBuffer[this.pcmIndex++] = Math.round(pcmVal)

      if (this.pcmIndex === 512) {
        this.flushFrame()
      }

      t += ratio
    }

    this.phase = t - len
    this.prevSample = channelData[len - 1]
    return true
  }

  flushFrame() {
    let sum = 0
    for (let i = 0; i < 512; i++) {
      const norm = this.pcmBuffer[i] / 32768.0
      sum += norm * norm
    }
    const rms = Math.sqrt(sum / 512)

    const isSpeech = rms >= this.vadThreshold

    if (isSpeech) {
      if (this.hangoverCount === 0 && this.preRollBuffer) {
        const pre = this.preRollBuffer
        this.port.postMessage(pre, [pre])
        this.preRollBuffer = null
      }
      this.hangoverCount = this.hangoverMax
      const buf = this.pcmBuffer.buffer
      this.port.postMessage(buf, [buf])
    } else if (this.hangoverCount > 0) {
      this.hangoverCount--
      const buf = this.pcmBuffer.buffer
      this.port.postMessage(buf, [buf])
    } else {
      const copy = new Int16Array(this.pcmBuffer)
      this.preRollBuffer = copy.buffer
    }

    this.pcmBuffer = new Int16Array(512)
    this.pcmIndex = 0
  }
}

registerProcessor('${WORKLET_NAME}', PcmWorkletProcessor)
`

async function initWorklet(audioContext) {
  try {
    await audioContext.audioWorklet.addModule('/pcm-worklet-processor.js')
    return
  } catch {
    // If static public path fails, load via inline Blob URL
  }

  const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' })
  const blobUrl = URL.createObjectURL(blob)
  try {
    await audioContext.audioWorklet.addModule(blobUrl)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

// Format duration seconds into mm:ss representation
const formatTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

// Waveform configuration
const BAR_COUNT    = 36
const BAR_GAP      = 2
const COLOR_NORMAL = '#14633F'
const COLOR_IDLE   = '#DCE6DF'

export default function AudioRecorder({
  onStart,
  onChunk,
  onStop,
  onReset,
  disabled = false,
  isProcessing = false,
}) {
  const [internalState, setInternalState] = useState('IDLE')
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)

  const recordingState = isProcessing ? 'PROCESSING' : internalState

  const streamRef         = useRef(null)
  const audioContextRef   = useRef(null)
  const workletNodeRef    = useRef(null)
  const silentGainRef     = useRef(null)
  const analyserRef       = useRef(null)
  const animationFrameRef = useRef(null)
  const stateRef          = useRef('IDLE')
  const canvasRef         = useRef(null)

  useEffect(() => {
    stateRef.current = recordingState
  }, [recordingState])

  // Timer incrementing elapsed recording seconds
  useEffect(() => {
    if (recordingState !== 'RECORDING') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [recordingState])

  // Draw audio frequency bars onto canvas
  const drawFrame = useCallback((analyser, dataArray) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)
    const isRecording = stateRef.current === 'RECORDING'
    const barW = (W - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT

    if (!isRecording) {
      ctx.fillStyle = COLOR_IDLE
      for (let i = 0; i < BAR_COUNT; i++) {
        ctx.fillRect(i * (barW + BAR_GAP), H - 4, barW, 4)
      }
      return
    }

    analyser.getByteFrequencyData(dataArray)
    const step = Math.floor(dataArray.length / BAR_COUNT)
    for (let i = 0; i < BAR_COUNT; i++) {
      const fraction = (dataArray[i * step] ?? 0) / 255
      const barH = Math.max(4, fraction * H)
      const x = i * (barW + BAR_GAP)
      const y = H - barH
      ctx.fillStyle = COLOR_NORMAL
      ctx.fillRect(x, y, barW, barH)
    }
  }, [])

  // Continuous animation loop for waveform
  const startVisualizerLoop = useCallback(
    (analyser) => {
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const loop = () => {
        if (stateRef.current !== 'RECORDING') {
          drawFrame(analyser, dataArray)
          animationFrameRef.current = null
          return
        }
        drawFrame(analyser, dataArray)
        animationFrameRef.current = requestAnimationFrame(loop)
      }
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = requestAnimationFrame(loop)
    },
    [drawFrame]
  )

  // Teardown audio pipeline
  const stopAudioPipeline = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }
    if (silentGainRef.current) {
      silentGainRef.current.disconnect()
      silentGainRef.current = null
    }
    analyserRef.current?.disconnect()
    analyserRef.current = null
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const barW = (canvas.width - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT
      ctx.fillStyle = COLOR_IDLE
      for (let i = 0; i < BAR_COUNT; i++) {
        ctx.fillRect(i * (barW + BAR_GAP), canvas.height - 4, barW, 4)
      }
    }
  }, [])

  useEffect(() => () => stopAudioPipeline(), [stopAudioPipeline])

  // Initialize canvas with resting bars
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const barW = (canvas.width - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT
    ctx.fillStyle = COLOR_IDLE
    for (let i = 0; i < BAR_COUNT; i++) {
      ctx.fillRect(i * (barW + BAR_GAP), canvas.height - 4, barW, 4)
    }
  }, [])

  // Start microphone capture and 16kHz PCM streaming via AudioWorklet
  const startConsultation = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone is not supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      await onStart?.()
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const audioContext = new AudioCtx()
      audioContextRef.current = audioContext
      if (audioContext.state === 'suspended') await audioContext.resume()

      // Load and register AudioWorklet module
      await initWorklet(audioContext)

      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.75
      analyserRef.current = analyser
      source.connect(analyser)

      // Instantiate AudioWorkletNode running downsampling, PCM conversion & VAD
      const workletNode = new AudioWorkletNode(audioContext, WORKLET_NAME)
      workletNodeRef.current = workletNode

      workletNode.port.onmessage = (e) => {
        if (stateRef.current !== 'RECORDING') return
        const pcmBuffer = e.data
        if (pcmBuffer instanceof ArrayBuffer) {
          onChunk?.(pcmBuffer)
        }
      }

      // Silent gain node connected to destination keeps audio pull-graph active
      const silentGain = audioContext.createGain()
      silentGain.gain.value = 0
      silentGainRef.current = silentGain

      source.connect(workletNode)
      workletNode.connect(silentGain)
      silentGain.connect(audioContext.destination)

      setSeconds(0)
      setInternalState('RECORDING')
      setTimeout(() => startVisualizerLoop(analyser), 0)
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
      setTimeout(() => startVisualizerLoop(analyserRef.current), 0)
    }
  }

  const processConsultation = () => {
    stopAudioPipeline()
    setInternalState('IDLE')
    onStop?.()
  }

  const resetSession = () => {
    stopAudioPipeline()
    setInternalState('IDLE')
    setSeconds(0)
    onReset?.()
  }

  const isRecording     = recordingState === 'RECORDING'
  const isPaused        = recordingState === 'PAUSED'
  const isProcessActive = recordingState === 'PROCESSING'

  return (
    <div className="bg-[#F3F7F4] border-t border-[#DCE6DF] px-3 sm:px-4 py-2.5 sm:py-3 shrink-0">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Status indicator & Live recording timer */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                isRecording
                  ? 'bg-[#B91C1C] ring-4 ring-[#B91C1C]/25 animate-pulse'
                  : isPaused
                  ? 'bg-[#B45309]'
                  : isProcessActive
                  ? 'bg-[#14633F] animate-pulse'
                  : 'bg-[#4A5D52]'
              }`}
            />
            <span className="text-xs sm:text-sm font-medium text-[#17211B]">
              {isRecording
                ? 'Listening'
                : isPaused
                ? 'Paused'
                : isProcessActive
                ? 'Analyzing'
                : 'Ready'}
            </span>
          </div>

          <span className="font-mono text-xs sm:text-sm tabular-nums text-[#4A5D52] pl-2 border-l border-[#DCE6DF]">
            {formatTime(seconds)}
          </span>
        </div>

        {/* Center: Waveform canvas (hidden on mobile, visible on desktop) */}
        <div className="hidden md:block flex-1 max-w-xs mx-2">
          <canvas
            ref={canvasRef}
            width={320}
            height={24}
            className="w-full h-6 block"
            aria-label="Acoustic waveform"
          />
        </div>

        {/* Right: Clean mic controls (44px min tap target) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {recordingState === 'IDLE' && (
            <button
              type="button"
              onClick={startConsultation}
              disabled={disabled || isProcessActive}
              className="btn-primary min-h-[48px] min-w-[48px] px-4 rounded-xl bg-[#14633F] text-white hover:bg-[#0D4A2F] text-xs sm:text-sm font-medium flex items-center gap-2 ring-4 ring-[#14633F]/15 disabled:opacity-50 transition-all active:scale-95"
            >
              <Mic className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span>Start recording</span>
            </button>
          )}

          {(isRecording || isPaused) && (
            <>
              <button
                type="button"
                onClick={processConsultation}
                className="btn-primary min-h-[44px] px-3 sm:px-4 rounded-xl bg-[#14633F] text-white hover:bg-[#0D4A2F] text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 active:scale-95"
              >
                <Check className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span>Complete</span>
              </button>

              {isRecording ? (
                <button
                  type="button"
                  onClick={pauseRecording}
                  className="btn-secondary min-h-[44px] px-3 rounded-xl border border-[#DCE6DF] bg-white text-[#17211B] hover:bg-[#F3F7F4] text-xs sm:text-sm font-medium flex items-center gap-1.5 active:scale-95"
                >
                  <Pause className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  <span className="hidden sm:inline">Pause</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resumeRecording}
                  className="btn-secondary min-h-[44px] px-3 rounded-xl border border-[#DCE6DF] bg-white text-[#14633F] hover:bg-[#F3F7F4] text-xs sm:text-sm font-medium flex items-center gap-1.5 active:scale-95"
                >
                  <Play className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  <span className="hidden sm:inline">Resume</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={resetSession}
            disabled={isRecording}
            title="Reset consultation"
            aria-label="Reset consultation"
            className="btn-icon min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#DCE6DF] bg-white text-[#4A5D52] hover:text-[#17211B] hover:bg-[#F3F7F4] disabled:opacity-40 active:scale-90"
          >
            <RotateCcw className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Error alert banner */}
      {error && (
        <div
          role="alert"
          className="mt-2.5 flex items-center gap-2 p-2.5 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-[#B91C1C] text-xs font-medium"
        >
          <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
