import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import AudioRecorder from '../components/consultation/AudioRecorder'
import LiveTranscript from '../components/consultation/LiveTranscript'
import PrescriptionReview from '../components/prescription/PrescriptionReview'
import WhatsAppModal from '../components/patient/WhatsAppModal'
import useWebSocket from '../hooks/useWebSocket'
import { MOCK_DISPATCH, MOCK_PRESCRIPTION } from '../data/mockData'
import { withUids } from '../utils/prescription'

let lineId = 0 // har line ki apni unique key

// Day 5: nakli "dispatch". Day 6 mein ye function backend ke /whatsapp/dispatch ko call karega
async function mockPrepare(phone) {
  await new Promise((r) => setTimeout(r, 800)) // network jaisa intezaar
  const script = MOCK_DISPATCH.voice_note.script
  return {
    ...MOCK_DISPATCH,
    recipient: phone,
    whatsapp_deep_link: `https://wa.me/${phone}?text=${encodeURIComponent(script)}`,
  }
}

export default function Consultation() {
  const navigate = useNavigate()
  const [lines, setLines] = useState([])
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [prescription, setPrescription] = useState(null)
  const [approved, setApproved] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const timerRef = useRef(null)

  // Backend / mock se aayi transcript line handle karo
  const handleMessage = useCallback((msg) => {
    if (msg.type === 'TRANSCRIPT') {
      setLines((prev) => [...prev, { id: ++lineId, speaker: msg.speaker, text: msg.text, is_final: true }])
    }
  }, [])

  const ws = useWebSocket({ mock: true, onMessage: handleMessage })

  // Page chhodte waqt timer saaf karo
  useEffect(() => () => clearTimeout(timerRef.current), [])

  // Koi bhi edit: approval hat jaata hai
  const handleEdit = (next) => {
    setPrescription(next)
    setApproved(false)
  }

  return (
    <DashboardLayout>
      {/* Wapas dashboard pe jaane ka button */}
      <button
        onClick={() => navigate('/')}
        className="mb-4 flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>

      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <AudioRecorder
            disabled={processing}
            onStart={() => {
              setLines([])
              setPrescription(null)
              setApproved(false)
              ws.connect()
              setRecording(true)
            }}
            onChunk={(blob) => ws.send(blob)}
            onStop={() => {
              ws.disconnect()
              setRecording(false)
              setProcessing(true)
              // 1.5 second baad mock prescription dikhao
              timerRef.current = setTimeout(() => {
                setPrescription(withUids(MOCK_PRESCRIPTION))
                setProcessing(false)
              }, 1500)
            }}
          />
          <LiveTranscript lines={lines} status={ws.status} error={ws.error} isRecording={recording} />
        </div>

        {processing && (
          <div className="flex items-center gap-3 rounded-xl bg-panel p-5 text-slate-300">
            <Loader2 className="animate-spin text-brand" /> Prescription ban rahi hai…
          </div>
        )}

        {prescription && (
          <>
            <PrescriptionReview
              data={prescription}
              onChange={handleEdit}
              approved={approved}
              onApprove={() => setApproved(true)}
            />

            <button
              onClick={() => setShareOpen(true)}
              disabled={!approved}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 font-medium text-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={18} /> Patient ko bhejein
            </button>
            {!approved && (
              <p className="text-center text-xs text-slate-500">
                Bhejne se pehle prescription approve karna zaroori hai.
              </p>
            )}
          </>
        )}

        <WhatsAppModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          approved={approved}
          onPrepare={mockPrepare}
        />
      </div>
    </DashboardLayout>
  )
}