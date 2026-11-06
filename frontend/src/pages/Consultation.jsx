import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import AudioRecorder from '../components/consultation/AudioRecorder'
import LiveTranscript from '../components/consultation/LiveTranscript'
import PrescriptionReview from '../components/prescription/PrescriptionReview'
import WhatsAppModal from '../components/patient/WhatsAppModal'
import useWebSocket from '../hooks/useWebSocket'
import { withUids } from '../utils/prescription'

let lineId = 0 // har line ki unique key

const WS_URL = 'ws://127.0.0.1:8000/ws/consultation'
const API_BASE_URL = 'http://127.0.0.1:8000'

export default function Consultation() {
  const navigate = useNavigate()
  const [lines, setLines] = useState([])
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [prescription, setPrescription] = useState(null)
  const [approved, setApproved] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const timerRef = useRef(null)

  // Backend se aane wale real-time messages handle karo
  const handleMessage = useCallback((msg) => {
    if (msg.type === 'TRANSCRIPT' || msg.type === 'TRANSCRIPT_UPDATE') {
      const text = msg.text || msg.interim || msg.transcript
      if (text) {
        setLines((prev) => [
          ...prev,
          {
            id: ++lineId,
            speaker: msg.speaker || 'Consultation',
            text: text,
            is_final: msg.is_final ?? true,
          },
        ])
      }
    } else if (msg.type === 'STATUS') {
      setStatusText(msg.message || '')
    } else if (msg.type === 'PRESCRIPTION_EXTRACTED') {
      setPrescription(withUids(msg.data))
      setProcessing(false)
      setStatusText('')
    } else if (msg.type === 'STRUCTURED_CARDS') {
      setPrescription(withUids(msg.payload))
      setProcessing(false)
      setStatusText('')
    }
  }, [])

  // Live WebSocket (Day 6 Integration)
  const ws = useWebSocket({ mock: false, onMessage: handleMessage })

  // Page chhodte waqt timer saaf karo
  useEffect(() => () => clearTimeout(timerRef.current), [])

  // Koi bhi edit: approval hat jaata hai
  const handleEdit = (next) => {
    setPrescription(next)
    setApproved(false)
  }

  // Live WhatsApp Dispatch Call to Backend REST API
  const handlePrepare = async (phone) => {
    const cleanPhone = phone.replace(/\D/g, '')
    const res = await fetch(`${API_BASE_URL}/api/v1/whatsapp/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_number: cleanPhone,
        prescription_data: prescription,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Dispatch failed: ${errText || res.statusText}`)
    }

    const data = await res.json()

    // Prefix backend host to relative paths so browser can access audio & PDF directly
    if (data.voice_note?.audio_url?.startsWith('/')) {
      data.voice_note.audio_url = `${API_BASE_URL}${data.voice_note.audio_url}`
    }
    if (data.pdf_receipt?.url?.startsWith('/')) {
      data.pdf_receipt.url = `${API_BASE_URL}${data.pdf_receipt.url}`
    }

    return data
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
              setStatusText('')
              ws.connect(WS_URL)
              setRecording(true)
            }}
            onChunk={(blob) => ws.send(blob)}
            onStop={() => {
              setRecording(false)
              setProcessing(true)
              setStatusText('Analyzing consultation dialogue with Evon LLM…')
              // Trigger backend extraction action
              ws.send(JSON.stringify({ action: 'PROCESS' }))
            }}
          />
          <LiveTranscript lines={lines} status={ws.status} error={ws.error} isRecording={recording} />
        </div>

        {processing && (
          <div className="flex items-center gap-3 rounded-xl bg-panel p-5 text-slate-300">
            <Loader2 className="animate-spin text-brand" /> {statusText || 'Prescription ban rahi hai…'}
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
          onPrepare={handlePrepare}
        />
      </div>
    </DashboardLayout>
  )
}
