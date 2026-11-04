import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Mic, Pause, Play, Square } from 'lucide-react'

// Chrome = webm, Safari = mp4. Jo browser support kare wahi lena hai
function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return options.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

// Technical error ko doctor ke samajhne layak message mein badlo
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

/**
 * Props (sab optional):
 *  onStart()     -> recording shuru hone se pehle
 *  onChunk(blob) -> har second ka audio chunk
 *  onStop(blob)  -> recording khatam, poori audio ek Blob mein
 *  disabled      -> true ho to Start button band
 */
export default function AudioRecorder({ onStart, onChunk, onStop, disabled = false }) {
  const [status, setStatus] = useState('idle') // idle | recording | paused
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)

  const recorderRef = useRef(null) // recorder yaad rakhne ke liye (screen redraw nahi karwata)
  const streamRef = useRef(null) // mic stream yaad rakhne ke liye
  const chunksRef = useRef([]) // saare chunks jama karne ke liye

  // Timer sirf "recording" mein chalta hai, pause par ruk jaata hai
  useEffect(() => {
    if (status !== 'recording') return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [status])

  // Mic (nal) band karna: warna browser mein red dot laga rehta hai
  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Page chhodte waqt bhi safai
  useEffect(
    () => () => {
      const r = recorderRef.current
      if (r && r.state !== 'inactive') {
        r.onstop = null
        r.stop()
      }
      releaseMic()
    },
    [releaseMic]
  )

  const start = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Is browser mein recording support nahi hai, ya page HTTPS/localhost par nahi khula hai.')
      return
    }
    try {
      // 1. Mic ki permission maango (popup yahin aata hai)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream

      await onStart?.() // 2. Parent ko batao (chunks aane se PEHLE)

      // 3. Recorder banao aur stream se jodo
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data) // poori recording ke liye jama karo
          onChunk?.(e.data) // aur live bhejne ke liye parent ko do
        }
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type }) // sab cups -> ek bottle
        releaseMic()
        setStatus('idle')
        onStop?.(blob)
      }
      recorder.onerror = () => {
        setError('Recording ke dauran error aaya. Dobara try karein.')
        releaseMic()
        setStatus('idle')
      }

      recorder.start(1000) // 1000 ms = har second ek chunk
      recorderRef.current = recorder
      setSeconds(0)
      setStatus('recording')
    } catch (err) {
      releaseMic()
      setError(micErrorMessage(err))
    }
  }

  const pause = () => {
    recorderRef.current?.pause()
    setStatus('paused')
  }
  const resume = () => {
    recorderRef.current?.resume()
    setStatus('recording')
  }
  const stop = () => recorderRef.current?.stop()

  const isActive = status !== 'idle'

  return (
    <section className="rounded-xl bg-panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Consultation recording</h2>
        <span className="font-mono text-2xl tabular-nums text-brand">{formatTime(seconds)}</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {status === 'idle' && 'Start dabakar consultation shuru karein.'}
        {status === 'recording' && 'Recording chal rahi hai…'}
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
              <button onClick={pause} className="flex items-center gap-2 rounded-full border border-slate-600 px-5 py-3 hover:bg-white/5">
                <Pause size={18} /> Pause
              </button>
            ) : (
              <button onClick={resume} className="flex items-center gap-2 rounded-full border border-brand px-5 py-3 text-brand hover:bg-white/5">
                <Play size={18} /> Resume
              </button>
            )}
            <button onClick={stop} className="flex items-center gap-2 rounded-full bg-rose-500 px-5 py-3 font-medium text-white hover:bg-rose-400">
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
        <div role="alert" className="mt-4 flex gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
    </section>
  )
}