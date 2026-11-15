import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowDown } from 'lucide-react'

/**
 * LiveTranscript.jsx - Plain Conversational Transcript Viewport
 * Strict Guardrail: Plain left-aligned conversational text, NO chat bubbles.
 * Phase 2 Zero-Lag:
 * - Direct subscription to useWebSocket interim stream (zero parent re-renders).
 * - Instant un-animated interim text paint (no opacity transition delay).
 * - Throttled requestAnimationFrame auto-scroll (no smooth scroll thrash).
 */

function LiveTranscript({
  lines = [],
  interim = '',
  subscribeInterim,
  status = 'idle',
  error = '',
  isRecording = false,
}) {
  const containerRef = useRef(null)
  const bottomRef = useRef(null)
  const scrollRafRef = useRef(null)
  const [autoScrollLocked, setAutoScrollLocked] = useState(true)
  const [streamInterim, setStreamInterim] = useState('')

  // Direct subscription to interim tokens from useWebSocket (zero parent re-renders)
  useEffect(() => {
    if (!subscribeInterim) return
    return subscribeInterim((text) => {
      setStreamInterim(text || '')
    })
  }, [subscribeInterim])

  // Pause sticky scroll when clinician scrolls up
  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setAutoScrollLocked(distanceFromBottom < 40)
  }

  // Zero-thrash instant auto-scroll throttled by requestAnimationFrame
  const scrollToBottom = useCallback(() => {
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current)
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      const el = containerRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    })
  }, [])

  const confirmedLines = lines.filter((l) => l.is_final !== false)
  const interimLines = lines.filter((l) => l.is_final === false)
  const currentInterim = subscribeInterim ? streamInterim : interim
  const activeInterimText = currentInterim || interimLines.map((l) => l.text).join(' ')

  // Auto-scroll when locked to bottom
  useEffect(() => {
    if (autoScrollLocked) {
      scrollToBottom()
    }
  }, [lines, activeInterimText, autoScrollLocked, scrollToBottom])

  // Clean up RAF on unmount
  useEffect(() => () => {
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current)
    }
  }, [])

  const resumeStickyScroll = () => {
    setAutoScrollLocked(true)
    const el = containerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }

  const isConnected = status === 'connected'

  return (
    <div className="relative flex flex-col flex-1 h-full min-h-0 bg-white">
      {/* Top quiet transcript header */}
      <div className="h-10 px-6 border-b border-[#DCE6DF] flex items-center justify-between text-xs text-[#4A5D52]">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-[#14633F]' : 'bg-[#DCE6DF]'
            }`}
          />
          <span className="font-medium">
            {isConnected ? 'Conversation live' : 'Consultation transcript'}
          </span>
        </div>
      </div>

      {/* Error alert banner */}
      {error && (
        <div
          role="alert"
          className="mx-6 mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-[#B91C1C] text-xs font-medium"
        >
          <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <span>{error}</span>
        </div>
      )}

      {/* Main scrollable conversational text viewport */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-5 text-base"
        aria-live="polite"
      >
        {confirmedLines.length === 0 && !activeInterimText ? (
          <div className="h-full flex flex-col justify-center items-start text-[#4A5D52] py-16">
            <p className="text-base font-normal max-w-[75ch] text-[#4A5D52]">
              {isRecording
                ? 'Listening to consultation. Speak naturally with the patient.'
                : 'Ready for consultation. Start speaking in Hindi, Tamil, Telugu, Bengali, or English.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-w-[75ch]">
            {confirmedLines.map((line) => {
              const speakerName = (line.speaker || 'Doctor').toLowerCase()
              const isPatient = speakerName.includes('patient') || speakerName.includes('pt')

              return (
                <div
                  key={line.id}
                  className={`space-y-1 ${
                    isPatient ? 'pl-5 border-l-2 border-[#DCE6DF]' : ''
                  }`}
                >
                  <div className="text-xs font-medium text-[#4A5D52]">
                    {isPatient ? 'Patient' : 'Doctor'}
                  </div>
                  <p className="text-base text-[#17211B] leading-relaxed animate-word-appear">
                    {line.text}
                  </p>
                </div>
              )
            })}

            {/* Interim live speech stream (instant paint at full contrast without opacity delay) */}
            {activeInterimText && (
              <div className="space-y-1 pl-1">
                <div className="text-xs font-medium text-[#14633F]">
                  Speaking…
                </div>
                <p className="text-base text-[#4A5D52] italic leading-relaxed">
                  {activeInterimText}
                </p>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Resume sticky scroll floating pill */}
      {!autoScrollLocked && (
        <button
          type="button"
          onClick={resumeStickyScroll}
          className="absolute bottom-4 right-6 min-h-[36px] px-3 rounded-full bg-white border border-[#DCE6DF] text-[#14633F] text-xs font-medium shadow-sm hover:bg-[#F3F7F4] flex items-center gap-1.5 transition-colors"
        >
          <ArrowDown className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Jump to recent</span>
        </button>
      )}
    </div>
  )
}

export default memo(LiveTranscript)
