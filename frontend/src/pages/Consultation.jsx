import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import AudioRecorder from '../components/consultation/AudioRecorder'
import LiveTranscript from '../components/consultation/LiveTranscript'
import PrescriptionReview from '../components/prescription/PrescriptionReview'
import WhatsAppModal, { WhatsAppIcon } from '../components/patient/WhatsAppModal'
import useWebSocket from '../hooks/useWebSocket'
import { withUids } from '../utils/prescription'

/**
 * Consultation.jsx - Real-Time Ambient Clinical Console (Minimalist Light Clinical)
 */

// Line counter and endpoint configurations
let lineId = 0

// Sanitize API and WebSocket URLs from environment variables
const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').trim()
const API_BASE_URL = rawApiUrl
  .replace(/\/+$/, '')
  .replace(/\/api\/v1\/?$/, '')
  .replace(/\/api\/?$/, '')

let rawWsUrl = (import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8000/ws/consultation').trim()
if (rawWsUrl.startsWith('https://')) {
  rawWsUrl = rawWsUrl.replace('https://', 'wss://')
} else if (rawWsUrl.startsWith('http://')) {
  rawWsUrl = rawWsUrl.replace('http://', 'ws://')
}
rawWsUrl = rawWsUrl.replace(/\/+$/, '')
if (!rawWsUrl.includes('/ws')) {
  rawWsUrl = `${rawWsUrl}/ws/consultation`
}
const WS_URL = rawWsUrl

// Live consultation page managing audio recording, real-time transcription, prescription review, and WhatsApp dispatch
export default function Consultation() {
  const navigate = useNavigate()

  // Local UI state variables
  const [lines, setLines] = useState([])
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [prescription, setPrescription] = useState(null)
  const [approved, setApproved] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const timerRef = useRef(null)

  // Handle incoming WebSocket messages (transcripts, reasoning status, and extracted prescriptions)
  const handleMessage = useCallback((msg) => {
    if (msg.type === 'TRANSCRIPT' || msg.type === 'TRANSCRIPT_UPDATE') {
      const token = msg.text || msg.interim || msg.transcript
      if (token) {
        setLines((prev) => [
          ...prev,
          {
            id: ++lineId,
            speaker: msg.speaker || 'Consultation',
            text: token,
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

  // Initialize WebSocket streaming hook
  const ws = useWebSocket({
    url: WS_URL,
    mock: false,
    onMessage: handleMessage,
  })

  // Clear pending timers on component unmount
  useEffect(() => () => clearTimeout(timerRef.current), [])

  // Update prescription data in state and reset doctor approval flag
  const handleEdit = (next) => {
    setPrescription(next)
    setApproved(false)
  }

  // Call backend WhatsApp dispatch endpoint to compile PDF and synthesize regional TTS audio
  const handlePrepare = async (phone) => {
    const cleanPhone = phone.replace(/\D/g, '')
    const targetUrl = `${API_BASE_URL}/api/v1/whatsapp/dispatch`.replace(/([^:]\/)\/+/g, '$1')
    console.log('[DocScribeAI] Dispatching WhatsApp payload to:', targetUrl)
    const res = await fetch(targetUrl, {
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

    // Prefix relative asset URLs with backend server address
    if (data.voice_note?.audio_url?.startsWith('/')) {
      data.voice_note.audio_url = `${API_BASE_URL}${data.voice_note.audio_url}`
    }
    if (data.pdf_receipt?.url?.startsWith('/')) {
      data.pdf_receipt.url = `${API_BASE_URL}${data.pdf_receipt.url}`
    }

    return data
  }

  // Start new recording consultation session and open WebSocket stream
  const handleStartConsultation = () => {
    setLines([])
    setPrescription(null)
    setApproved(false)
    setStatusText('')
    ws.connect(WS_URL)
    setRecording(true)
  }

  // Stop recording and trigger LLM clinical extraction
  const handleProcessConsultation = () => {
    setRecording(false)
    setProcessing(true)
    setStatusText('Analyzing dialogue…')
    ws.triggerProcess()
  }

  // Reset current consultation state and notify backend
  const handleResetSession = () => {
    setRecording(false)
    setProcessing(false)
    setLines([])
    setPrescription(null)
    setApproved(false)
    setStatusText('')
    ws.resetSession()
  }

  return (
    <DashboardLayout>
      {/* Return button navigating back to Dashboard */}
      <button
        onClick={() => navigate('/')}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950 transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="space-y-4">
        {/* Top Grid: Audio Ingestion & Live Ambient Transcript */}
        <div className="grid gap-4 lg:grid-cols-2">
          <AudioRecorder
            disabled={processing}
            isProcessing={processing}
            onStart={handleStartConsultation}
            onChunk={(pcmBuffer) => ws.sendAudioChunk(pcmBuffer)}
            onStop={handleProcessConsultation}
            onReset={handleResetSession}
          />

          <LiveTranscript
            lines={lines}
            interim={ws.interimTranscript}
            status={ws.status}
            error={ws.error}
            isRecording={recording}
            latency="~140ms"
          />
        </div>

        {/* AI extraction reasoning progress alert */}
        {processing && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-teal-200 bg-teal-50 p-3.5 text-teal-900 shadow-xs">
            <Loader2 className="animate-spin text-teal-600" size={18} />
            <span className="text-xs font-bold">
              {statusText || 'Analyzing dialogue with AI…'}
            </span>
          </div>
        )}

        {/* Prescription Review & WhatsApp Dispatch Action */}
        {prescription && (
          <>
            <PrescriptionReview
              data={prescription}
              onChange={handleEdit}
              approved={approved}
              onApprove={() => setApproved(true)}
            />

            {/* Primary WhatsApp dispatch trigger */}
            <div className="space-y-1.5 pt-1">
              <button
                onClick={() => setShareOpen(true)}
                disabled={!approved}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40 transition"
              >
                <WhatsAppIcon className="h-4 w-4 fill-white" />
                <span>Send via WhatsApp</span>
              </button>
              {!approved && (
                <p className="text-center text-[11px] font-semibold text-slate-500">
                  Approve prescription before sending.
                </p>
              )}
            </div>
          </>
        )}

        {/* Modal dialog for WhatsApp delivery */}
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
