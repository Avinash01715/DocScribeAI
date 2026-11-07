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

/**
 * Consultation.jsx - Real-Time Ambient Clinical Operating Console
 *
 * Implements specifications:
 * 1. Coordinates global consultation lifecycle between Audio Ingestion Engine & Clinical Viewport.
 * 2. Integrates reactive useWebSocket state machine (16kHz PCM streaming, Evon LLM status, Prescription DTO).
 * 3. Human-in-the-loop clinical review and approval gating.
 * 4. Multimodal WhatsApp dispatch trigger.
 */

let lineId = 0
const WS_URL = 'ws://127.0.0.1:8000/ws/consultation'
const API_BASE_URL = 'http://127.0.0.1:8000'

export default function Consultation() {
  const navigate = useNavigate()

  // Local UI State
  const [lines, setLines] = useState([])
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [prescription, setPrescription] = useState(null)
  const [approved, setApproved] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const timerRef = useRef(null)

  // Message Handler for incoming backend frames
  const handleMessage = useCallback((msg) => {
    // 1. Live Transcript Update
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
    }
    // 2. LLM Reasoning Status Indicator
    else if (msg.type === 'STATUS') {
      setStatusText(msg.message || '')
    }
    // 3. Structured Clinical Extraction DTO
    else if (msg.type === 'PRESCRIPTION_EXTRACTED') {
      setPrescription(withUids(msg.data))
      setProcessing(false)
      setStatusText('')
    } else if (msg.type === 'STRUCTURED_CARDS') {
      setPrescription(withUids(msg.payload))
      setProcessing(false)
      setStatusText('')
    }
  }, [])

  // Reactive WebSocket State Coordinator Hook
  const ws = useWebSocket({
    url: WS_URL,
    mock: false,
    onMessage: handleMessage,
  })

  // Cleanup timers on unmount
  useEffect(() => () => clearTimeout(timerRef.current), [])

  // Editing any field invalidates previous approval to enforce verification
  const handleEdit = (next) => {
    setPrescription(next)
    setApproved(false)
  }

  // Multimodal Dispatch Handler (POST to /api/v1/whatsapp/dispatch)
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

    // Resolve relative static audio & PDF URLs to absolute backend host
    if (data.voice_note?.audio_url?.startsWith('/')) {
      data.voice_note.audio_url = `${API_BASE_URL}${data.voice_note.audio_url}`
    }
    if (data.pdf_receipt?.url?.startsWith('/')) {
      data.pdf_receipt.url = `${API_BASE_URL}${data.pdf_receipt.url}`
    }

    return data
  }

  // Handler: Start Consultation
  const handleStartConsultation = () => {
    setLines([])
    setPrescription(null)
    setApproved(false)
    setStatusText('')
    ws.connect(WS_URL)
    setRecording(true)
  }

  // Handler: Process Consultation
  const handleProcessConsultation = () => {
    setRecording(false)
    setProcessing(true)
    setStatusText('Analyzing clinical dialogue with Evon LLM...')
    // Emits action to backend Evon LLM extractor
    ws.triggerProcess()
  }

  // Handler: New Patient (Reset)
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
      {/* Return to Dashboard Navigation */}
      <button
        onClick={() => navigate('/')}
        className="mb-4 flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100 transition"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>

      <div className="space-y-5">
        {/* Top Grid: Audio Ingestion Engine & Live Ambient Viewport */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Audio Ingestion Engine: Web Audio API, 16kHz PCM, VU Meter */}
          <AudioRecorder
            disabled={processing}
            isProcessing={processing}
            onStart={handleStartConsultation}
            onChunk={(pcmBuffer) => ws.sendAudioChunk(pcmBuffer)}
            onStop={handleProcessConsultation}
            onReset={handleResetSession}
          />

          {/* Clinical Viewport: Real-Time Gnani Prisma STT Streaming */}
          <LiveTranscript
            lines={lines}
            interim={ws.interimTranscript}
            status={ws.status}
            error={ws.error}
            isRecording={recording}
            latency="~140ms"
          />
        </div>

        {/* Evon LLM Reasoning Progress Bar */}
        {processing && (
          <div className="flex items-center gap-3 rounded-xl border border-teal-500/30 bg-panel p-5 text-slate-200">
            <Loader2 className="animate-spin text-teal-400" size={22} />
            <span className="font-medium">
              {statusText || 'Analyzing clinical dialogue with Evon LLM…'}
            </span>
          </div>
        )}

        {/* Structured Prescription Grid & Human-in-the-Loop Review */}
        {prescription && (
          <>
            <PrescriptionReview
              data={prescription}
              onChange={handleEdit}
              approved={approved}
              onApprove={() => setApproved(true)}
            />

            {/* Final Dispatch Action Button */}
            <button
              onClick={() => setShareOpen(true)}
              disabled={!approved}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-teal-500 px-6 py-3.5 font-semibold text-ink shadow-lg shadow-teal-500/20 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40 transition"
            >
              <Send size={18} /> Send Prescription to Patient (WhatsApp Dispatch)
            </button>
            {!approved && (
              <p className="text-center text-xs text-slate-400">
                Please approve the clinical prescription above prior to patient dispatch.
              </p>
            )}
          </>
        )}

        {/* Multimodal Dispatch Orchestrator Modal */}
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
