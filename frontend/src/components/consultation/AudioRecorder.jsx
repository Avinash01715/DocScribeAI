import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Mic, Pause, Play, Square } from 'lucide-react'

// -------------------------------------------------------------------------
// PR Change: Real-time Audio Processing Pipeline for Gnani Prisma STT:
// 1. Downsamples hardware stream (44.1kHz / 48kHz) to standardized 16kHz.
// 2. Encodes Float32 samples into 16-bit signed Linear PCM (little-endian).
// -------------------------------------------------------------------------
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

// Convert Float32 samples [-1.0, 1.0] to 16-bit signed Linear PCM (little-endian)
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
      return 'Microphone ki permission block hai. Address bar ke lock icon se allow karein.'
    case 'NotFoundError':
      return 'Koi microphone nahi mila. Mic connect karke dobara try karein.'
    case 'NotReadableError':
      return 'Microphone kisi aur app use kar rahi hai. Wo app band karein.'
    default:
      return err?.message || 'Recording start nahi ho payi.'
  }
}

const formatTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function AudioRecorder({ onStart, onChunk, onStop, disabled = false }) {
  const [status, setStatus] = useState('idle') // idle | recording | paused
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)

  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const statusRef = useRef('idle')

  useEffect(() => {
    statusRef.current = status
  }, [status])

  // Timer
  useEffect(() => {
    if (status !== 'recording') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [status])

  const stopAudioPipeline = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => () => stopAudioPipeline(), [stopAudioPipeline])

  const start = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Is browser mein microphone access support nahi hai ya page secure (HTTPS/localhost) par nahi hai.')
      return
    }

    try {
      // 1. Get raw microphone stream
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

      // 2. Set up Web Audio API pipeline for real-time 16kHz PCM streaming
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const audioContext = new AudioCtx()
      audioContextRef.current = audioContext

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const source = audioContext.createMediaStreamSource(stream)
      // Buffer size 2048 gives ~46ms chunks at 44.1k/48k, or ~128ms at 16k
      const processor = audioContext.createScriptProcessor(2048, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (statusRef.current !== 'recording') return
        const channelData = e.inputBuffer.getChannelData(0)
        // Downsample to 16,000 Hz if hardware uses 44.1k or 48k
        const downsampled = downsampleTo16k(channelData, audioContext.sampleRate)
        // Convert to 16-bit linear PCM byte buffer
        const pcmBuffer = floatTo16BitPCM(downsampled)
        onChunk?.(pcmBuffer)
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      setSeconds(0)
      setStatus('recording')
    } catch (err) {
      stopAudioPipeline()
      setError(micErrorMessage(err))
    }
  }

  const pause = () => {
    setStatus('paused')
    if (audioContextRef.current?.state === 'running') {
      audioContextRef.current.suspend()
    }
  }

  const resume = () => {
    setStatus('recording')
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume()
    }
  }

  const stop = () => {
    stopAudioPipeline()
    setStatus('idle')
    onStop?.()
  }

  const isActive = status !== 'idle'

  return (
    <section className="rounded-xl bg-panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Consultation recording</h2>
        <span className="font-mono text-2xl tabular-nums text-brand">{formatTime(seconds)}</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {status === 'idle' && 'Start dabakar bolna shuru karein. Aapki awaaz live transcribe hogi.'}
        {status === 'recording' && 'Recording chal rahi hai… Aapki awaaz live transcribe ho rahi hai.'}
        {status === 'paused' && 'Recording paused hai.'}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!isActive ? (
          <button
            onClick={start}
            disabled={disabled}
            className="flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-medium text-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mic size={20} /> Start consultation
          </button>
        ) : (
          <>
            {status === 'recording' ? (
              <button
                onClick={pause}
                className="flex items-center gap-2 rounded-full border border-slate-600 px-5 py-3 hover:bg-white/5"
              >
                <Pause size={18} /> Pause
              </button>
            ) : (
              <button
                onClick={resume}
                className="flex items-center gap-2 rounded-full border border-brand px-5 py-3 text-brand hover:bg-white/5"
              >
                <Play size={18} /> Resume
              </button>
            )}
            <button
              onClick={stop}
              className="flex items-center gap-2 rounded-full bg-rose-500 px-5 py-3 font-medium text-white hover:bg-rose-400"
            >
              <Square size={18} /> Stop
            </button>
            {status === 'recording' && (
              <span className="flex items-center gap-2 text-sm text-rose-300">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" /> LIVE
              </span>
            )}
          </>
        )}
      </div>

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
