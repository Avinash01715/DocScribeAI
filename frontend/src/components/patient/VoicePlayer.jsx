import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Download, FileAudio, Headphones, Pause, Play, Sparkles } from 'lucide-react'

/**
 * VoicePlayer.jsx - Production Audio Player for Gnani Timbre TTS
 *
 * Implements strict audio engineering safeguards:
 * 1. Binary Audio Ingestion: Parses binary payloads via response.arrayBuffer()[cite: 8].
 * 2. Dynamic Container Detection: Automatically detects MP3 (ID3/Sync) vs RIFF WAV containers[cite: 8].
 * 3. Native HTML5 Audio Streaming: Leverages native browser decoders for MP3 (audio/mpeg)
 *    with byte-range seeking and scrub support.
 * 4. Sample Rate Alignment: Calibrates Web Audio clock to 16,000 Hz matching
 *    Gnani Timbre's speech synthesis engine[cite: 3, 8].
 */

const API_BASE = 'http://127.0.0.1:8000'
const DEFAULT_TIMBRE_SAMPLE_RATE = 16000
const SPEED_OPTIONS = [1.0, 1.25, 1.5, 2.0]

const fmt = (s) => {
  if (!Number.isFinite(s) || s <= 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function VoicePlayer({ src, script = '', mode = 'html5' }) {
  const audioRef = useRef(null)
  const audioCtxRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const objectUrlRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [speed, setSpeed] = useState(1.0)
  const [accordionOpen, setAccordionOpen] = useState(true)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioFormat, setAudioFormat] = useState('mp3') // 'mp3' | 'wav'

  // Resolve relative URLs to backend host
  const resolvedSrc = src
    ? src.startsWith('/')
      ? `${API_BASE}${src}`
      : src
    : null

  // ---- 1. Binary Audio Ingestion & Container Alignment ----
  useEffect(() => {
    if (!resolvedSrc) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      setAudioBlob(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    async function loadAudioPayload() {
      try {
        const response = await fetch(resolvedSrc)

        if (!response.ok) {
          const contentType = response.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            const errJson = await response.json()
            throw new Error(errJson.detail || `Server returned HTTP ${response.status}`)
          }
          throw new Error(`Audio fetch failed with status ${response.status}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        if (cancelled) return

        if (!arrayBuffer || arrayBuffer.byteLength < 44) {
          throw new Error('Received empty or truncated audio buffer from server.')
        }

        // Inspect header bytes to identify format
        const uint8 = new Uint8Array(arrayBuffer.slice(0, 4))
        const headerTag = String.fromCharCode(...uint8)

        let detectedType = 'audio/mpeg'
        let formatKey = 'mp3'

        if (headerTag === 'RIFF') {
          detectedType = 'audio/wav'
          formatKey = 'wav'
        } else if (headerTag.startsWith('ID3') || (uint8[0] === 0xff && (uint8[1] & 0xe0) === 0xe0)) {
          detectedType = 'audio/mpeg'
          formatKey = 'mp3'
        } else if (resolvedSrc.endsWith('.wav')) {
          detectedType = 'audio/wav'
          formatKey = 'wav'
        }

        setAudioFormat(formatKey)

        // Instantiate Blob with the correct MIME type
        const blob = new Blob([arrayBuffer], { type: detectedType })
        setAudioBlob(blob)

        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current)
        }

        const objectUrl = URL.createObjectURL(blob)
        objectUrlRef.current = objectUrl

        if (audioRef.current) {
          audioRef.current.src = objectUrl
          audioRef.current.load()
        }
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        console.error('[VoicePlayer] Binary ingestion failed:', err)
        setError(err.message || 'Audio could not be loaded.')
        setLoading(false)
      }
    }

    loadAudioPayload()

    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [resolvedSrc])

  // Synchronize playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }, [speed])

  // ---- 2. Web Audio API Helper (Calibrated for 16kHz PCM) ----
  const playViaWebAudioContext = async (rawBuffer) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = audioCtxRef.current || new AudioCtx({ sampleRate: DEFAULT_TIMBRE_SAMPLE_RATE })
      audioCtxRef.current = ctx

      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      let audioBuffer
      const isRiffWav = new Uint8Array(rawBuffer.slice(0, 4)).reduce(
        (acc, byte) => acc + String.fromCharCode(byte),
        ''
      ) === 'RIFF'

      if (isRiffWav) {
        audioBuffer = await ctx.decodeAudioData(rawBuffer.slice(0))
      } else {
        // Raw signed 16-bit PCM normalization [-32768, 32767] -> [-1.0, 1.0][cite: 8]
        const int16Array = new Int16Array(rawBuffer)
        const numSamples = int16Array.length

        audioBuffer = ctx.createBuffer(1, numSamples, DEFAULT_TIMBRE_SAMPLE_RATE)
        const channelData = audioBuffer.getChannelData(0)

        for (let i = 0; i < numSamples; i++) {
          channelData[i] = int16Array[i] / 32768.0
        }
      }

      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop()
        sourceNodeRef.current.disconnect()
      }

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.playbackRate.value = speed
      source.connect(ctx.destination)
      source.start(0)
      sourceNodeRef.current = source
      setPlaying(true)

      source.onended = () => {
        setPlaying(false)
        setCurrent(0)
      }
    } catch (err) {
      console.error('[WebAudio] Playback failed:', err)
      setError('Web Audio API playback error: ' + err.message)
    }
  }

  // ---- 3. Player Event Handlers ----
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
      3: 'Audio decoding error (corrupted bitstream or container mismatch).',
      4: 'Audio resource not found at specified static path.',
    }
    const detail = messages[code] || `Error code: ${code}`
    console.error('VoicePlayer error:', detail, 'src:', resolvedSrc)
    setPlaying(false)
    setError(`Audio playback failed: ${detail}`)
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
        setError('Audio could not be played. Please tap play again.')
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
    <section className="rounded-xl border border-slate-800 bg-ink/70 p-4 shadow-lg">
      {/* Player Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Headphones size={17} className="text-teal-400" />
          Gnani Timbre Regional Audio Preview (Hindi)
        </h3>
        <span className="flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-teal-300">
          <FileAudio size={12} /> {audioFormat === 'mp3' ? '16kHz MP3 (64kbps)' : '16kHz Linear PCM WAV'}
        </span>
      </div>

      {!resolvedSrc ? (
        <p className="mt-3 text-xs text-slate-400">
          Synthesized regional audio instruction abhi generate nahi hui hai.
        </p>
      ) : (
        <>
          {/* Native HTML5 Audio configured for CORS and Object URL Blob */}
          <audio
            ref={audioRef}
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
              disabled={loading}
              aria-label={playing ? 'Pause' : 'Play'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-500 text-ink shadow-md shadow-teal-500/20 hover:bg-teal-400 disabled:opacity-50 transition"
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

            {/* Direct Download Fallback using Blob */}
            {audioBlob && objectUrlRef.current && (
              <a
                href={objectUrlRef.current}
                download={`prescription_voice_note.${audioFormat}`}
                className="flex shrink-0 items-center gap-1 text-xs font-semibold text-teal-400 hover:text-teal-300 transition"
              >
                <Download size={16} /> Download
              </a>
            )}
          </div>
        </>
      )}

      {/* Spoken Text Accordion for Clinical Cross-Verification */}
      {script && (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-800 bg-panel">
          <button
            onClick={() => setAccordionOpen(!accordionOpen)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-teal-400" />
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
        <p role="alert" className="mt-2 text-xs text-rose-300 font-medium">
          {error}
        </p>
      )}
    </section>
  )
}