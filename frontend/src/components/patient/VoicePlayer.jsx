import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Pause, Play, Volume2 } from 'lucide-react'

/**
 * VoicePlayer.jsx - Compact Clinical Voice Note Player
 * Clean bright paper aesthetic with vernacular script display.
 */

const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').trim()
const API_BASE = rawApiUrl
  .replace(/\/+$/, '')
  .replace(/\/api\/v1\/?$/, '')
  .replace(/\/api\/?$/, '')

const SPEED_OPTIONS = [1.0, 1.25, 1.5]

const fmt = (s) => {
  if (!Number.isFinite(s) || s <= 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function VoicePlayer({ src, script = '' }) {
  const audioRef = useRef(null)
  const objectUrlRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [speed, setSpeed] = useState(1.0)
  const [scriptOpen, setScriptOpen] = useState(true)

  const resolvedSrc = src
    ? src.startsWith('/')
      ? `${API_BASE}${src}`
      : src
    : null

  useEffect(() => {
    if (!resolvedSrc) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      return
    }

    let cancelled = false

    async function loadAudio() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(resolvedSrc)
        if (!response.ok) throw new Error('Audio could not be loaded.')

        const arrayBuffer = await response.arrayBuffer()
        if (cancelled) return

        const uint8 = new Uint8Array(arrayBuffer.slice(0, 4))
        const headerTag = String.fromCharCode(...uint8)
        const detectedType = headerTag === 'RIFF' ? 'audio/wav' : 'audio/mpeg'

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
        setError('Voice instruction audio is not ready.')
        setLoading(false)
      }
    }

    loadAudio()

    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [resolvedSrc])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

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
        setError('Playback interrupted.')
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
    <div className="rounded-xl border border-[#DCE6DF] bg-[#F3F7F4] p-3.5 text-xs">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5 font-medium text-[#17211B]">
          <Volume2 className="w-4 h-4 text-[#14633F]" strokeWidth={1.75} />
          <span>Patient voice instructions</span>
        </div>
        <button
          type="button"
          onClick={cycleSpeed}
          className="btn-secondary min-h-[36px] min-w-[44px] px-2.5 rounded-lg border border-[#DCE6DF] bg-white text-[#4A5D52] hover:text-[#17211B] font-mono text-xs font-medium"
        >
          {speed.toFixed(2).replace(/\.00$/, '')}×
        </button>
      </div>

      {!resolvedSrc ? (
        <p className="text-xs text-[#4A5D52]">Audio instructions not yet synthesized.</p>
      ) : (
        <>
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
            onEnded={() => {
              setPlaying(false)
              setCurrent(0)
            }}
            onError={() => {
              setPlaying(false)
              setError('Audio playback error.')
            }}
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              disabled={loading}
              aria-label={playing ? 'Pause audio' : 'Play audio'}
              className="btn-primary w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-[#14633F] text-white hover:bg-[#0D4A2F] disabled:opacity-50"
            >
              {playing ? (
                <Pause className="w-4 h-4 fill-white" strokeWidth={1.75} />
              ) : (
                <Play className="w-4 h-4 ml-0.5 fill-white" strokeWidth={1.75} />
              )}
            </button>

            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={Number.isFinite(duration) && duration > 0 ? duration : 0}
                step={0.1}
                value={current}
                onChange={seek}
                className="w-full accent-[#14633F] cursor-pointer h-2 bg-[#DCE6DF] rounded-lg"
              />
              <div className="flex justify-between font-mono text-[11px] text-[#4A5D52] mt-1 tabular-nums">
                <span>{fmt(current)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Spoken vernacular text */}
      {script && (
        <div className="mt-3 pt-2.5 border-t border-[#DCE6DF]">
          <button
            type="button"
            onClick={() => setScriptOpen(!scriptOpen)}
            className="flex items-center justify-between w-full text-left text-xs font-medium text-[#17211B] py-1"
          >
            <span>Spoken text</span>
            {scriptOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#4A5D52]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[#4A5D52]" />
            )}
          </button>
          {scriptOpen && (
            <p className="mt-1 text-xs text-[#17211B] leading-relaxed bg-white p-2.5 rounded border border-[#DCE6DF]">
              {script}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-[#B91C1C]">{error}</p>}
    </div>
  )
}
