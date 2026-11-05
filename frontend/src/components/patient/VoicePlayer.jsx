import { useEffect, useRef, useState } from 'react'
import { Headphones, Pause, Play } from 'lucide-react'

const fmt = (s) => {
  if (!Number.isFinite(s)) return '--:--' // webm streams ki duration kabhi kabhi Infinity hoti hai
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/**
 * Props:
 *  src -> audio file ka URL (null/undefined = abhi audio bani nahi)
 */
export default function VoicePlayer({ src }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')

  // src badle to naya Audio object banao, purana saaf karo
  useEffect(() => {
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    setError('')
    if (!src) return

    const audio = new Audio(src) // HTML5 Audio API
    audio.preload = 'metadata'
    audioRef.current = audio

    audio.onloadedmetadata = () => setDuration(audio.duration)
    audio.ontimeupdate = () => setCurrent(audio.currentTime)
    audio.onended = () => {
      setPlaying(false)
      setCurrent(0)
    }
    audio.onerror = () => {
      setPlaying(false)
      setError('Audio load nahi ho paayi. File ya internet check karein.')
    }

    return () => {
      audio.pause()
      audio.src = '' // download rok do
      audioRef.current = null
    }
  }, [src])

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      try {
        await audio.play() // browser block kare to yahan error aata hai
        setPlaying(true)
      } catch {
        setError('Audio play nahi ho payi. Dobara tap karein.')
      }
    }
  }

  const seek = (e) => {
    const t = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = t
    setCurrent(t)
  }

  return (
    <section className="rounded-xl bg-ink/60 p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <Headphones size={18} className="text-brand" /> Patient voice instructions
      </h3>

      {!src ? (
        // Empty state: audio abhi bani nahi
        <p className="mt-2 text-sm text-slate-500">Voice instructions abhi available nahi hain.</p>
      ) : (
        <div className="mt-3 flex items-center gap-4">
          <button
            onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-ink hover:opacity-90"
          >
            {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
          </button>
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
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-300">
          {error}
        </p>
      )}
    </section>
  )
}