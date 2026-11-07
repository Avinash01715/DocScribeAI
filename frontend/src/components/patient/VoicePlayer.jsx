import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Download, FileAudio, Headphones, Pause, Play } from 'lucide-react'

/**
 * VoicePlayer.jsx - Timbre Regional Audio Preview
 *
 * Implements specifications:
 * 1. Ingests audio stream URL hosted at /static/audio/... (Gnani Timbre TTS regional audio).
 * 2. HTML5 <audio> wrapper with custom styling matching Medical Teal theme.
 * 3. Interactive controls:
 *    - Play/Pause toggle
 *    - Playback speed selector (1.0x, 1.25x, 1.5x, 2.0x)
 *    - Progress scrubber
 *    - Download fallback
 * 4. Spoken text accordion for quick clinician cross-verification of the vernacular Hindi script.
 */

const API_BASE = 'http://127.0.0.1:8000'
const SPEED_OPTIONS = [1.0, 1.25, 1.5, 2.0]

const fmt = (s) => {
  if (!Number.isFinite(s) || s <= 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function VoicePlayer({ src, script = '' }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')
  const [speed, setSpeed] = useState(1.25)
  // Accordion toggle state for spoken text verification
  const [accordionOpen, setAccordionOpen] = useState(true)

  // Resolve relative URLs (e.g. /static/audio/rx_xxx.wav) to full backend URL
  const resolvedSrc = src
    ? src.startsWith('/')
      ? `${API_BASE}${src}`
      : src
    : null

  // Synchronize playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }, [speed])

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
      setDuration(audioRef.current.duration)
      setCurrent(0)
      setPlaying(false)
      setError('')
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrent(audioRef.current.currentTime)
  }

  const handleEnded = () => {
    setPlaying(false)
    setCurrent(0)
  }

  const handleError = () => {
    const code = audioRef.current?.error?.code
    const messages = {
      1: 'Playback was aborted.',
      2: 'Network error encountered during audio fetch.',
      3: 'Audio decoding error.',
      4: 'Audio resource not found at specified static path.',
    }
    const detail = messages[code] || `Error code: ${code}`
    console.error('VoicePlayer error:', detail, 'src:', resolvedSrc)
    setPlaying(false)
    setError(`Audio load nahi ho paayi (${detail}).`)
  }

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
      } catch (err) {
        console.error('Play rejected:', err)
        setError('Audio play nahi ho payi. Kripya dobara tap karein.')
      }
    }
  }

  const seek = (e) => {
    const t = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = t
    setCurrent(t)
  }

  const cycleSpeed = () => {
    setSpeed((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev)
      return SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length]
    })
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-ink/70 p-4">
      {/* Player Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Headphones size={17} className="text-teal-400" />
          Gnani Timbre Regional Audio Preview (Hindi)
        </h3>
        <span className="flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-teal-300">
          <FileAudio size={12} /> 16kHz TTS
        </span>
      </div>

      {!resolvedSrc ? (
        <p className="mt-3 text-xs text-slate-400">
          Synthesized regional audio instruction abhi generate nahi hui hai.
        </p>
      ) : (
        <>
          {/* Native HTML5 Audio wrapper configured for CORS */}
          <audio
            ref={audioRef}
            src={resolvedSrc}
            preload="metadata"
            crossOrigin="anonymous"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onError={handleError}
          />

          {/* Interactive Player Controls */}
          <div className="mt-3 flex items-center gap-3">
            {/* Play / Pause Toggle Button */}
            <button
              onClick={toggle}
              aria-label={playing ? 'Pause' : 'Play'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-500 text-ink shadow-md shadow-teal-500/20 hover:bg-teal-400 transition"
            >
              {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>

            {/* Progress Scrubber Bar */}
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={Number.isFinite(duration) && duration > 0 ? duration : 0}
                step={0.1}
                value={current}
                onChange={seek}
                aria-label="Audio scrubber"
                className="w-full accent-teal-400 cursor-pointer"
              />
              <div className="flex justify-between font-mono text-[11px] tabular-nums text-slate-400">
                <span>{fmt(current)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            {/* Speed Selector (1.0x, 1.25x, 1.5x, 2.0x) */}
            <button
              onClick={cycleSpeed}
              title="Change playback speed"
              className="shrink-0 rounded-lg border border-slate-700 bg-panel px-2.5 py-1 text-xs font-mono font-semibold text-teal-300 hover:border-teal-400 transition"
            >
              {speed.toFixed(2).replace(/\.00$/, '')}×
            </button>

            {/* Direct Download Fallback */}
            <a
              href={resolvedSrc}
              download="consultation_instructions.wav"
              className="flex shrink-0 items-center gap-1 text-xs font-semibold text-teal-400 hover:text-teal-300 transition"
            >
              <Download size={16} /> Download
            </a>
          </div>
        </>
      )}

      {/* ---- 4. Transcribed Spoken Text Accordion ---- */}
      {script && (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-800 bg-panel">
          <button
            onClick={() => setAccordionOpen(!accordionOpen)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
          >
            <span className="flex items-center gap-1.5">
              <span>Transcribed Spoken Hindi Text (Verification)</span>
            </span>
            {accordionOpen ? (
              <ChevronUp size={15} className="text-teal-400" />
            ) : (
              <ChevronDown size={15} className="text-slate-400" />
            )}
          </button>
          {accordionOpen && (
            <div className="border-t border-slate-800/80 bg-ink/50 p-3 text-xs leading-relaxed text-slate-200">
              <p className="font-sans">{script}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </section>
  )
}
