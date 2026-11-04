import { useEffect, useRef } from 'react'
import { AlertTriangle, Radio } from 'lucide-react'

const STATUS_LABEL = {
  idle: { text: 'Ready', color: 'bg-slate-500' },
  connecting: { text: 'Connect ho raha hai…', color: 'bg-amber-400' },
  connected: { text: 'Live', color: 'bg-brand' },
  closed: { text: 'Stop', color: 'bg-slate-500' },
  error: { text: 'Error', color: 'bg-rose-500' },
}

/**
 * Props:
 *  lines       -> [{ id, speaker, text, is_final }]
 *  status      -> ws.status
 *  error       -> error message
 *  isRecording -> khali panel ka text badalne ke liye
 */
export default function LiveTranscript({ lines = [], status = 'idle', error = '', isRecording = false }) {
  const bottomRef = useRef(null)
  const badge = STATUS_LABEL[status] || STATUS_LABEL.idle

  // Nayi line aate hi neeche tak scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [lines])

  return (
    <section className="flex h-88 flex-col rounded-xl bg-panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Live transcript</h2>
        <span className="flex items-center gap-2 text-sm text-slate-300">
          <span className={`h-2.5 w-2.5 rounded-full ${badge.color} ${status === 'connected' ? 'animate-pulse' : ''}`} />
          {badge.text}
        </span>
      </div>

      {error && (
        <div role="alert" className="mb-3 flex gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
            <Radio size={28} className="mb-2" />
            <p className="text-sm">
              {isRecording ? 'Bolna shuru karein, transcript yahan dikhega…' : 'Consultation shuru hone par transcript yahan aayega.'}
            </p>
          </div>
        ) : (
          lines.map((l) => (
            <div key={l.id}>
              {l.speaker && <p className="text-xs font-medium text-brand">{l.speaker}</p>}
              {/* is_final false = abhi adhura text, halka dikhate hain */}
              <p className={l.is_final ? 'text-slate-100' : 'italic text-slate-400'}>{l.text}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  )
}