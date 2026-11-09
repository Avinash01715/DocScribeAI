import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, FileAudio, Headphones, Pause, Play, Sparkles } from 'lucide-react'

/**
 * VoicePlayer.jsx - Production Audio Player (Minimalist Light Clinical)
 */

// Base API URL and audio playback speed presets
const API_BASE = 'http://127.0.0.1:8000'
const SPEED_OPTIONS = [1.0, 1.25, 1.5, 2.0]

// Format seconds into MM:SS display format
const fmt = (s) => {
  if (!Number.isFinite(s) || s <= 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// Media player component for listening to generated vernacular patient voice notes
export default function VoicePlayer({ src, script = '' }) {
  const audioRef = useRef(null)
  const objectUrlRef = useRef(null)

  // Playback and format state variables
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [speed, setSpeed] = useState(1.0)
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [audioFormat, setAudioFormat] = useState('mp3')

  // Resolve relative endpoint paths into absolute URLs
  const resolvedSrc = src
    ? src.startsWith('/')
      ? `${API_BASE}${src}`
      : src
    : null

  // Fetch audio stream into memory blob and create local Object URL for reliable browser streaming
  useEffect(() => {
    if (!resolvedSrc) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      return
    }

    let cancelled = false

    // Async loader detecting container format (MP3 vs WAV) and loading into audio element
    async function loadAudio() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(resolvedSrc)
        if (!response.ok) throw new Error('Audio fetch failed')

        const arrayBuffer = await response.arrayBuffer()
        if (cancelled) return

        const uint8 = new Uint8Array(arrayBuffer.slice(0, 4))
        const headerTag = String.fromCharCode(...uint8)
        let detectedType = 'audio/mpeg'
        let formatKey = 'mp3'

        if (headerTag === 'RIFF') {
          detectedType = 'audio/wav'
          formatKey = 'wav'
        }
        setAudioFormat(formatKey)

        const blob = new Blob([arrayBuffer], { type: detectedType })
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)

        const objectUrl = URL.createObjectURL(blob)
        objectUrlRef.current = objectUrl

        if (audioRef.current) {
          audioRef.current.src = objectUrl
          audioRef.current.load()
        }
        setLoading(false)
      } catch {
        if (cancelled) return
        setError('Audio unavailable.')
        setLoading(false)
      }
    }

    loadAudio()

    // Clean up revoked Object URL on unmount or URL change
    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [resolvedSrc])

  // Synchronize audio element playback rate with selected speed
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  // Toggle between play and pause states
  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      try {
        audio.playbackRate = speed
        await audio.play()
        setPlaying(true)
      } catch {
        setError('Tap play again.')
      }
    }
  }

  // Handle timeline scrubber seek changes
  const seek = (e) => {
    const t = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = t
    setCurrent(t)
  }

  // Cycle through available playback speed options (1.0x, 1.25x, 1.5x, 2.0x)
  const cycleSpeed = () => {
    setSpeed((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev)
      return SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length]
    })
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
      {/* Player header with container format badge */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
          <Headphones size={14} className="text-teal-600" />
          Patient Voice Note
        </h3>
        <span className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-mono font-bold text-teal-800">
          <FileAudio size={11} /> {audioFormat.toUpperCase()}
        </span>
      </div>

      {!resolvedSrc ? (
        <p className="mt-2 text-xs font-medium text-slate-400">Audio not generated.</p>
      ) : (
        <>
          {/* HTML5 audio element binding playback listeners */}
          <audio
            ref={audioRef}
            preload="metadata"
            crossOrigin="anonymous"
            onLoadedMetadata={() => {
              if (audioRef.current) {
                setDuration(audioRef.current.duration)
                setCurrent(0)
                setPlaying(false)
              }
            }}
            onTimeUpdate={() => audioRef.current && setCurrent(audioRef.current.currentTime)}
            onEnded={() => { setPlaying(false); setCurrent(0) }}
            onError={() => { setPlaying(false); setError('Playback error.') }}
          />

          {/* Player controls: Play/Pause button, timeline slider, and speed toggler */}
          <div className="mt-2.5 flex items-center gap-2.5">
            <button
              onClick={toggle}
              disabled={loading}
              aria-label={playing ? 'Pause' : 'Play'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 transition"
            >
              {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
            </button>

            {/* Time progress bar */}
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={Number.isFinite(duration) && duration > 0 ? duration : 0}
                step={0.1}
                value={current}
                onChange={seek}
                className="w-full accent-teal-600 cursor-pointer h-1"
              />
              <div className="flex justify-between font-mono text-[10px] font-bold tabular-nums text-slate-600">
                <span>{fmt(current)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            {/* Playback speed multiplier button */}
            <button
              onClick={cycleSpeed}
              className="shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-800 hover:bg-slate-100 transition shadow-2xs"
            >
              {speed.toFixed(2).replace(/\.00$/, '')}×
            </button>
          </div>
        </>
      )}

      {/* Spoken vernacular script accordion */}
      {script && (
        <div className="mt-2.5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80">
          <button
            onClick={() => setAccordionOpen(!accordionOpen)}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] font-bold text-slate-800 hover:bg-slate-100/70 transition"
          >
            <span className="flex items-center gap-1">
              <Sparkles size={11} className="text-teal-600" />
              <span>Spoken Script</span>
            </span>
            {accordionOpen ? <ChevronUp size={13} className="text-teal-600" /> : <ChevronDown size={13} className="text-slate-500" />}
          </button>
          {accordionOpen && (
            <div className="border-t border-slate-200 bg-white p-2.5 text-xs leading-relaxed text-slate-800 font-medium">
              <p>{script}</p>
            </div>
          )}
        </div>
      )}

      {/* Audio playback error message */}
      {error && <p className="mt-1 text-xs font-bold text-rose-700">{error}</p>}
    </section>
  )
}
