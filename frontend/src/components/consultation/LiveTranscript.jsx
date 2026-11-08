import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, Cpu, Radio } from 'lucide-react'

/**
 * LiveTranscript.jsx - Real-Time Ambient Speech Viewport (Light Clinical High-Contrast)
 */

const STATUS_LABEL = {
  idle: { text: 'Ready', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
  connecting: { text: 'Connecting…', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-900 border-amber-300' },
  connected: { text: 'Prisma Live', dot: 'bg-emerald-600', badge: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
  closed: { text: 'Offline', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
  error: { text: 'Stream Error', dot: 'bg-rose-600', badge: 'bg-rose-50 text-rose-900 border-rose-300' },
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

  const [autoScrollLocked, setAutoScrollLocked] = useState(true)

  const badge = STATUS_LABEL[status] || STATUS_LABEL.idle

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const isAtBottom = distanceFromBottom < 35
    setAutoScrollLocked(isAtBottom)
  }

  useEffect(() => {
    if (autoScrollLocked) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [lines, interim, autoScrollLocked])

  const resumeStickyScroll = () => {
    setAutoScrollLocked(true)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  const confirmedLines = lines.filter((l) => l.is_final !== false)
  const interimLines = lines.filter((l) => l.is_final === false)
  const activeInterimText = interim || interimLines.map((l) => l.text).join(' ')

  return (
    <section className="relative flex h-88 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      {/* Viewport Header */}
      <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">Live Transcript</h2>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${badge.badge}`}>
            <span
              className={`h-1.5 w-1.5 rounded-full ${badge.dot} ${status === 'connected' ? 'animate-pulse' : ''}`}
            />
            {badge.text}
          </span>
        </div>

        <span
          className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-mono font-bold text-teal-800"
          title="Gnani Prisma latency"
        >
          <Cpu size={11} className="text-teal-700" />
          {latency}
        </span>
      </div>

      {/* Stream Error Banner */}
      {error && (
        <div
          role="alert"
          className="mb-2.5 flex gap-1.5 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-800"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-600" /> {error}
        </div>
      )}

      {/* Dual-Buffer Dialogue Viewport */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-2 overflow-y-auto pr-1 text-xs"
        aria-live="polite"
      >
        {confirmedLines.length === 0 && !activeInterimText ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
            <Radio size={20} className="mb-1.5 text-slate-300" />
            <p className="text-xs font-medium">
              {isRecording ? 'Listening… speak clearly.' : 'Click Start Recording to transcribe.'}
            </p>
          </div>
        ) : (
          <>
            {/* Confirmed lines */}
            {confirmedLines.map((l) => (
              <div key={l.id} className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 space-y-0.5">
                {l.speaker && (
                  <p className="text-[10px] font-bold text-teal-800 uppercase tracking-wider">
                    {l.speaker}
                  </p>
                )}
                <p className="leading-relaxed text-slate-900 font-semibold">
                  {l.text}
                </p>
              </div>
            ))}

            {/* Interim tokens */}
            {activeInterimText && (
              <div className="rounded-xl bg-teal-50 border border-teal-200 p-2.5 space-y-0.5">
                <p className="text-[10px] font-bold text-teal-800 uppercase tracking-wider">
                  Listening…
                </p>
                <p className="inline-block leading-relaxed text-teal-950 font-mono font-bold">
                  {activeInterimText}
                  <span className="ml-1 inline-block h-3 w-1 bg-teal-600 animate-pulse align-middle" />
                </p>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Floating Scroll Resumption Pill */}
      {!autoScrollLocked && (
        <button
          onClick={resumeStickyScroll}
          className="absolute bottom-3 right-5 flex items-center gap-1 rounded-full border border-teal-300 bg-white px-3 py-1 text-xs font-bold text-teal-800 shadow-md transition hover:bg-slate-50"
        >
          <ArrowDown size={12} className="animate-bounce text-teal-600" /> Scroll to bottom
        </button>
      )}
    </section>
  )
}
