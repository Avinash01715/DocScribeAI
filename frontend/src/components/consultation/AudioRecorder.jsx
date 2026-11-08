import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Mic, Pause, Play, RefreshCw, Send, Volume2 } from 'lucide-react'

/**
 * AudioRecorder.jsx – Acoustic Capture Pipeline (Minimalist Light Clinical)
 */

function downsampleTo16k(input, fromRate) {
  if (fromRate === 16000) return input
  const ratio = fromRate / 16000
  const newLength = Math.round(input.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    result[i] = input[Math.min(Math.round(i * ratio), input.length - 1)]
  }
  return result
}

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
    case 'NotAllowedError': return 'Microphone permission blocked.'
    case 'NotFoundError':   return 'No microphone found.'
    case 'NotReadableError':return 'Microphone is busy.'
    default:                return err?.message || 'Recording failed to initialize.'
  }
}

const formatTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

const BAR_COUNT      = 48
const BAR_GAP        = 2
const COLOR_NORMAL   = '#0d9488'
const COLOR_HIGH     = '#e11d48'
const COLOR_IDLE     = '#cbd5e1'
const HIGH_THRESHOLD = 0.75

export default function AudioRecorder({ onStart, onChunk, onStop, onReset, disabled = false, isProcessing = false }) {
  const [internalState, setInternalState]  = useState('IDLE')
  const [error, setError]                  = useState('')
  const [seconds, setSeconds]              = useState(0)

  const recordingState = isProcessing ? 'PROCESSING' : internalState

  const streamRef        = useRef(null)
  const audioContextRef  = useRef(null)
  const processorRef     = useRef(null)
  const analyserRef      = useRef(null)
  const animationFrameRef= useRef(null)
  const stateRef         = useRef('IDLE')
  const canvasRef        = useRef(null)

  useEffect(() => { stateRef.current = recordingState }, [recordingState])

  useEffect(() => {
    if (recordingState !== 'RECORDING') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [recordingState])

  const drawFrame = useCallback((analyser, dataArray) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    const isRecording = stateRef.current === 'RECORDING'
    const barW = (W - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT

    if (!isRecording) {
      ctx.fillStyle = COLOR_IDLE
      for (let i = 0; i < BAR_COUNT; i++) ctx.fillRect(i * (barW + BAR_GAP), H - 3, barW, 3)
      return
    }

    analyser.getByteFrequencyData(dataArray)
    const step = Math.floor(dataArray.length / BAR_COUNT)
    for (let i = 0; i < BAR_COUNT; i++) {
      const fraction = (dataArray[i * step] ?? 0) / 255
      const barH = Math.max(3, fraction * H)
      const x = i * (barW + BAR_GAP)
      const y = H - barH
      ctx.fillStyle = fraction > HIGH_THRESHOLD ? COLOR_HIGH : COLOR_NORMAL
      ctx.globalAlpha = 0.95
      const r = Math.min(barW / 2, 2)
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

  const startVisualizerLoop = useCallback((analyser) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const loop = () => {
      if (stateRef.current !== 'RECORDING') { drawFrame(analyser, dataArray); animationFrameRef.current = null; return }
      drawFrame(analyser, dataArray)
      animationFrameRef.current = requestAnimationFrame(loop)
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = requestAnimationFrame(loop)
  }, [drawFrame])

  const stopAudioPipeline = useCallback(() => {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null }
    processorRef.current?.disconnect(); processorRef.current = null
    analyserRef.current?.disconnect();  analyserRef.current  = null
    if (audioContextRef.current?.state !== 'closed') { audioContextRef.current?.close().catch(() => {}); audioContextRef.current = null }
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const barW = (canvas.width - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT
      ctx.fillStyle = COLOR_IDLE
      for (let i = 0; i < BAR_COUNT; i++) ctx.fillRect(i * (barW + BAR_GAP), canvas.height - 3, barW, 3)
    }
  }, [])

  useEffect(() => () => stopAudioPipeline(), [stopAudioPipeline])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const barW = (canvas.width - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT
    ctx.fillStyle = COLOR_IDLE
    for (let i = 0; i < BAR_COUNT; i++) ctx.fillRect(i * (barW + BAR_GAP), canvas.height - 3, barW, 3)
  }, [])

  const startConsultation = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      streamRef.current = stream
      await onStart?.()
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const audioContext = new AudioCtx()
      audioContextRef.current = audioContext
      if (audioContext.state === 'suspended') await audioContext.resume()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.75
      analyserRef.current = analyser
      source.connect(analyser)
      const processor = audioContext.createScriptProcessor(2048, 1, 1)
      processorRef.current = processor
      processor.onaudioprocess = (e) => {
        if (stateRef.current !== 'RECORDING') return
        onChunk?.(floatTo16BitPCM(downsampleTo16k(e.inputBuffer.getChannelData(0), audioContext.sampleRate)))
      }
      source.connect(processor); processor.connect(audioContext.destination)
      setSeconds(0); setInternalState('RECORDING')
      setTimeout(() => startVisualizerLoop(analyser), 0)
    } catch (err) { stopAudioPipeline(); setError(micErrorMessage(err)) }
  }

  const pauseRecording = () => { setInternalState('PAUSED'); audioContextRef.current?.state === 'running' && audioContextRef.current.suspend() }
  const resumeRecording = () => { setInternalState('RECORDING'); audioContextRef.current?.state === 'suspended' && audioContextRef.current.resume(); analyserRef.current && setTimeout(() => startVisualizerLoop(analyserRef.current), 0) }
  const processConsultation = () => { stopAudioPipeline(); setInternalState('IDLE'); onStop?.() }
  const resetSession = () => { stopAudioPipeline(); setInternalState('IDLE'); setSeconds(0); onReset?.() }

  const isRecording    = recordingState === 'RECORDING'
  const isPaused       = recordingState === 'PAUSED'
  const isProcessActive= recordingState === 'PROCESSING'

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">Audio Intake</h2>
          <span className="text-[11px] font-semibold text-slate-500">
            {recordingState === 'IDLE'   && 'Ready'}
            {isRecording                 && 'Recording…'}
            {isPaused                    && 'Paused'}
            {isProcessActive             && 'Analyzing…'}
          </span>
        </div>
        <span className={`font-mono text-xl font-bold tabular-nums ${isRecording ? 'text-teal-700' : 'text-slate-500'}`}>
          {formatTime(seconds)}
        </span>
      </div>

      {/* Waveform */}
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
          <span className="flex items-center gap-1 text-slate-600">
            <Volume2 size={13} className={isRecording ? 'text-teal-600' : 'text-slate-400'} />
            Signal
          </span>
          {isRecording
            ? <span className="flex items-center gap-1 text-rose-700 font-bold"><span className="h-1.5 w-1.5 animate-ping rounded-full bg-rose-600" /> LIVE</span>
            : <span className="text-slate-400">{isPaused ? 'Paused' : 'Idle'}</span>
          }
        </div>
        <canvas ref={canvasRef} width={800} height={48} className="block h-12 w-full rounded" aria-label="Waveform" />
      </div>

      {/* Controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {recordingState === 'IDLE' && (
          <button
            onClick={startConsultation}
            disabled={disabled || isProcessActive}
            className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-40 transition"
          >
            <Mic size={14} /> Start Recording
          </button>
        )}

        {(isRecording || isPaused) && (
          <>
            <button
              onClick={processConsultation}
              className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700 transition"
            >
              <Send size={14} /> Process
            </button>

            {isRecording ? (
              <button onClick={pauseRecording} className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition">
                <Pause size={14} /> Pause
              </button>
            ) : (
              <button onClick={resumeRecording} className="flex items-center gap-1 rounded-xl border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100 transition">
                <Play size={14} /> Resume
              </button>
            )}
          </>
        )}

        <button
          onClick={resetSession}
          disabled={isRecording}
          className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <RefreshCw size={13} /> Reset
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-2.5 flex gap-1.5 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-600" /> {error}
        </div>
      )}
    </section>
  )
}
