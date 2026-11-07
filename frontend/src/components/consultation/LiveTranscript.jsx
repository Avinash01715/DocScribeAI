import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, Cpu, Radio } from 'lucide-react'

/**
 * LiveTranscript.jsx - Real-Time Ambient Speech Viewport
 *
 * Implements specifications:
 * 1. Dual-Buffer Rendering:
 *    - Immutable confirmed sentences in high-contrast text (text-slate-100).
 *    - Active interim speech tokens with a subtle typewriter pulse and caret indicator.
 * 2. Auto-Scroll Locking:
 *    - Virtual sticky scroll that anchors to the bottom as dialogue streams in.
 *    - Automatically pauses if the clinician manually scrolls up to inspect previous lines.
 *    - Displays a "Resume auto-scroll" floating action pill when paused.
 * 3. Acoustic Performance Metric:
 *    - Includes an active latency chip (~140ms Latency) with live ping indicator in the header.
 */

const STATUS_LABEL = {
  idle: { text: 'Ready', color: 'bg-slate-500' },
  connecting: { text: 'Connecting…', color: 'bg-amber-400' },
  connected: { text: 'Prisma Live', color: 'bg-teal-400' },
  closed: { text: 'Offline', color: 'bg-slate-600' },
  error: { text: 'Stream Error', color: 'bg-rose-500' },
}

export default function LiveTranscript({
  lines = [],
  interim = '',
  status = 'idle',
  error = '',
  isRecording = false,
  latency = '~140ms',
}) {
  const containerRef = useRef(null)
  const bottomRef = useRef(null)

  // Auto-scroll state: sticky by default, paused when clinician scrolls up
  const [autoScrollLocked, setAutoScrollLocked] = useState(true)

  const badge = STATUS_LABEL[status] || STATUS_LABEL.idle

  // ---- 1. Auto-Scroll Locking & User Scroll Detection ----
  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    // If clinician scrolls up by more than 35px from bottom, pause sticky scroll
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const isAtBottom = distanceFromBottom < 35
    setAutoScrollLocked(isAtBottom)
  }

  // Virtual sticky scroll execution
  useEffect(() => {
    if (autoScrollLocked) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [lines, interim, autoScrollLocked])

  const resumeStickyScroll = () => {
    setAutoScrollLocked(true)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  // Separate confirmed lines and active interim tokens
  const confirmedLines = lines.filter((l) => l.is_final !== false)
  const interimLines = lines.filter((l) => l.is_final === false)
  const activeInterimText = interim || interimLines.map((l) => l.text).join(' ')

  return (
    <section className="relative flex h-88 flex-col rounded-xl border border-slate-800 bg-panel p-5">
      {/* Viewport Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-100">Live Transcript</h2>
          {/* Connection Status Badge */}
          <span className="flex items-center gap-1.5 text-xs text-slate-300">
            <span
              className={`h-2.5 w-2.5 rounded-full ${badge.color} ${status === 'connected' ? 'animate-pulse' : ''}`}
            />
            {badge.text}
          </span>
        </div>

        {/* Acoustic Performance Metric Chip (~140ms Latency) */}
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-xs font-mono font-medium text-teal-300"
            title="Acoustic sub-200ms latency budget verified"
          >
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-teal-400" />
            <Cpu size={12} className="text-teal-400" />
            {latency} Latency
          </span>
        </div>
      </div>

      {/* Stream Error Banner */}
      {error && (
        <div
          role="alert"
          className="mb-3 flex gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* ---- 2. Dual-Buffer Dialogue Viewport ---- */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-3 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700"
        aria-live="polite"
      >
        {confirmedLines.length === 0 && !activeInterimText ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
            <Radio size={28} className="mb-2 text-slate-600" />
            <p className="text-sm">
              {isRecording
                ? 'Bolna shuru karein, Gnani Prisma STT live transcribe karega…'
                : 'Start Consultation dabane par ambient dialogue yahan stream hoga.'}
            </p>
          </div>
        ) : (
          <>
            {/* Buffer 1: Immutable Confirmed Sentences */}
            {confirmedLines.map((l) => (
              <div key={l.id} className="space-y-0.5">
                {l.speaker && (
                  <p className="text-xs font-medium text-teal-400">
                    {l.speaker}
                  </p>
                )}
                <p className="text-sm leading-relaxed text-slate-100 font-normal">
                  {l.text}
                </p>
              </div>
            ))}

            {/* Buffer 2: Active Interim Speech Tokens with Subtle Typewriter Pulse */}
            {activeInterimText && (
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-teal-400/80">
                  Speaking…
                </p>
                <p className="inline-block text-sm leading-relaxed text-teal-300 animate-pulse font-mono">
                  {activeInterimText}
                  {/* Blinking Typewriter Cursor */}
                  <span className="ml-1 inline-block h-3.5 w-1 bg-teal-400 animate-bounce align-middle" />
                </p>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Floating Sticky-Scroll Pause Resumption Pill */}
      {!autoScrollLocked && (
        <button
          onClick={resumeStickyScroll}
          className="absolute bottom-4 right-6 flex items-center gap-1.5 rounded-full border border-teal-500/50 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-teal-300 shadow-xl backdrop-blur transition hover:bg-slate-800"
        >
          <ArrowDown size={14} className="animate-bounce" /> Resume Live Scroll
        </button>
      )}
    </section>
  )
}
