import { useEffect, useRef, useState } from 'react'
import { Headphones, Pause, Play, Download } from 'lucide-react'

// Must match API_BASE_URL in Consultation.jsx
const API_BASE = 'http://127.0.0.1:8000'

const SPEED_OPTIONS = [1.0, 1.25, 1.5, 1.75, 2.0]

const fmt = (s) => {
  if (!Number.isFinite(s) || s <= 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/**
 * Props:
 *  src -> audio file ka URL (null/undefined = abhi audio bani nahi)
 *         Can be a relative path (/static/audio/rx_xxx.wav) or full URL.
 */
export default function VoicePlayer({ src }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')
  const [speed, setSpeed] = useState(1.5) // default: 1.5x (faster than normal)

  // Resolve relative URLs (e.g. /static/audio/file.wav) to full backend URL
  const resolvedSrc = src
    ? src.startsWith('/')
      ? `${API_BASE}${src}`
      : src
    : null

  // Reset state when src changes
  useEffect(() => {
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    setError('')
    if (audioRef.current) {
      audioRef.current.load()
    }
  }, [resolvedSrc])

  // Apply speed whenever it changes (even mid-playback)
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }, [speed])

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed // apply speed on load too
      setDuration(audioRef.current.duration)
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
      1: 'Loading cancelled.',
      2: 'Network error while loading audio.',
      3: 'Audio decoding failed (unsupported format?).',
      4: 'Audio source not found or not supported.',
    }
    const detail = messages[code] || `Unknown error (code: ${code}).`
    console.error('VoicePlayer error:', detail, 'src:', resolvedSrc)
    setPlaying(false)
    setError(`Audio load nahi ho paayi. ${detail}`)
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
        setError('Audio play nahi ho payi. Dobara tap karein.')
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
    <section className="rounded-xl bg-ink/60 p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <Headphones size={18} className="text-brand" /> Patient voice instructions
      </h3>

      {!resolvedSrc ? (
        <p className="mt-2 text-sm text-slate-500">
          Voice instructions abhi available nahi hain.
        </p>
      ) : (
        <>
          {/* Native <audio> element — browser handles decoding & CORS reliably */}
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

          <div className="mt-3 flex items-center gap-3">
            {/* Play / Pause */}
            <button
              onClick={toggle}
              aria-label={playing ? 'Pause' : 'Play'}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-ink hover:opacity-90"
            >
              {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
            </button>

            {/* Progress bar + timestamps */}
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={Number.isFinite(duration) && duration > 0 ? duration : 0}
                step={0.1}
                value={current}
                onChange={seek}
                aria-label="Audio progress"
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-xs tabular-nums text-slate-400">
                <span>{fmt(current)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            {/* Speed toggle button */}
            <button
              onClick={cycleSpeed}
              title="Playback speed badlein"
              className="shrink-0 rounded-full border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:border-brand hover:text-brand"
            >
              {speed}×
            </button>

            {/* Download */}
            <a
              href={resolvedSrc}
              download="prescription_note.wav"
              className="flex shrink-0 items-center gap-1.5 text-brand hover:opacity-80"
            >
              <Download size={18} />
              <span className="text-sm">Download</span>
            </a>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-300">
          {error}
        </p>
      )}
    </section>
  )
}
