import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, FileText, Loader2, Mic } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import AudioRecorder from '../components/consultation/AudioRecorder'
import LiveTranscript from '../components/consultation/LiveTranscript'
import PrescriptionReview from '../components/prescription/PrescriptionReview'
import WhatsAppModal from '../components/patient/WhatsAppModal'
import useWebSocket from '../hooks/useWebSocket'
import { withUids } from '../utils/prescription'
import { LANGUAGE_OPTIONS } from '../utils/languages'

/**
 * Consultation.jsx - Desktop 3-Column Clinical Workspace
 * Left Column: Slim Icon Sidebar (w-16) via DashboardLayout
 * Center Column: Live Conversation Transcript (flex-1) with Bottom Recording Bar
 * Right Column: The Rx Sheet (w-[420px] lg:w-[460px] Paper Prescription Pad)
 */

let lineId = 0

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

export default function Consultation() {
  const navigate = useNavigate()

  const [lines, setLines] = useState([])
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [prescription, setPrescription] = useState(null)
  const [approved, setApproved] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState('hi')
  const [mobileTab, setMobileTab] = useState('transcript') // 'transcript' | 'rx'
  const timerRef = useRef(null)

  const handleMessage = useCallback((msg) => {
    if (msg.type === 'TRANSCRIPT' || msg.type === 'TRANSCRIPT_UPDATE') {
      const isFinal = msg.is_final ?? true
      const token = msg.text || msg.interim || msg.transcript
      if (token && isFinal) {
        setLines((prev) => [
          ...prev,
          {
            id: ++lineId,
            speaker: msg.speaker || 'Consultation',
            text: token,
            is_final: true,
          },
        ])
      }
    } else if (msg.type === 'STATUS') {
      setStatusText(msg.message || '')
    } else if (msg.type === 'PRESCRIPTION_EXTRACTED') {
      setPrescription(withUids(msg.data))
      setProcessing(false)
      setStatusText('')
      setMobileTab('rx')
    } else if (msg.type === 'STRUCTURED_CARDS') {
      setPrescription(withUids(msg.payload))
      setProcessing(false)
      setStatusText('')
      setMobileTab('rx')
    }
  }, [])

  const ws = useWebSocket({
    url: WS_URL,
    mock: false,
    onMessage: handleMessage,
  })

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleEdit = (next) => {
    setPrescription(next)
    setApproved(false)
  }

  const handlePrepare = async (phone) => {
    const cleanPhone = phone.replace(/\D/g, '')
    const targetUrl = `${API_BASE_URL}/api/v1/whatsapp/dispatch`.replace(/([^:]\/)\/+/g, '$1')
    const patientNameClean = (prescription?.patient_info?.name || 'patient').replace(/\s+/g, '_')
    const idempotencyKey = `rx_${cleanPhone}_${patientNameClean}`.toLowerCase()

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        phone_number: cleanPhone,
        prescription_data: prescription,
        language: selectedLanguage || 'hi',
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Dispatch failed: ${errText || res.statusText}`)
    }

    const data = await res.json()

    if (data.voice_note?.audio_url?.startsWith('/')) {
      data.voice_note.audio_url = `${API_BASE_URL}${data.voice_note.audio_url}`
    }
    if (data.pdf_receipt?.url?.startsWith('/')) {
      data.pdf_receipt.url = `${API_BASE_URL}${data.pdf_receipt.url}`
    }

    return data
  }

  const handleStartConsultation = () => {
    setLines([])
    setPrescription(null)
    setApproved(false)
    setStatusText('')
    ws.connect(WS_URL)
    setRecording(true)
  }

  const handleProcessConsultation = () => {
    setRecording(false)
    setProcessing(true)
    setStatusText('Analyzing dialogue…')
    ws.triggerProcess()
  }

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
    <DashboardLayout fullWidth>
      {/* 3-Column Desktop Grid / Stacked Mobile Layout */}
      <div className="flex flex-col md:flex-row h-[calc(100dvh-3.5rem-4rem)] md:h-screen md:max-h-screen overflow-hidden bg-white">
        
        {/* CENTER COLUMN: Live Conversation Transcript & Controls */}
        <div
          className={`flex-1 flex flex-col h-full min-h-0 bg-white border-r border-[#DCE6DF] ${
            mobileTab === 'rx' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Top Bar: Back link + View Switcher + Language Selector */}
          <div className="h-14 px-3 sm:px-6 border-b border-[#DCE6DF] flex items-center justify-between gap-2 sm:gap-4 bg-white shrink-0">
            <button
              type="button"
              onClick={() => navigate('/')}
              title="Return to dashboard"
              className="btn-icon min-h-[44px] min-w-[44px] px-2 rounded-lg text-xs font-medium text-[#4A5D52] hover:text-[#17211B] flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span className="hidden sm:inline">Dashboard</span>
            </button>

            {/* Mobile View Switcher Pill Bar (< 768px) */}
            <div
              role="tablist"
              aria-label="Consultation mobile views"
              className="md:hidden flex-1 max-w-[240px] flex items-center p-0.5 bg-[#F3F7F4] border border-[#DCE6DF] rounded-xl"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === 'transcript'}
                onClick={() => setMobileTab('transcript')}
                className={`flex-1 min-h-[38px] px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                  mobileTab === 'transcript'
                    ? 'bg-white text-[#14633F] shadow-sm font-semibold'
                    : 'text-[#4A5D52]'
                }`}
              >
                <Mic className="w-3.5 h-3.5 shrink-0" />
                <span>Transcript</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === 'rx'}
                onClick={() => setMobileTab('rx')}
                className={`flex-1 min-h-[38px] px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                  mobileTab === 'rx'
                    ? 'bg-white text-[#14633F] shadow-sm font-semibold'
                    : 'text-[#4A5D52]'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>Rx Pad</span>
                {prescription?.prescription?.length > 0 && (
                  <span className="min-w-[18px] h-4 px-1 rounded-full bg-[#14633F] text-white text-[10px] font-bold inline-flex items-center justify-center">
                    {prescription.prescription.length}
                  </span>
                )}
              </button>
            </div>

            {/* Language Picker: Desktop Segmented Buttons (sm:) */}
            <div
              role="group"
              aria-label="Patient voice instruction language"
              className="hidden sm:flex items-center gap-1 bg-[#F3F7F4] border border-[#DCE6DF] rounded-lg p-0.5"
            >
              <span className="text-xs text-[#4A5D52] px-2 font-medium">
                Audio:
              </span>
              {LANGUAGE_OPTIONS.map((opt) => {
                const isSelected = selectedLanguage === opt.code
                return (
                  <button
                    key={opt.code}
                    type="button"
                    disabled={recording || processing}
                    onClick={() => setSelectedLanguage(opt.code)}
                    aria-pressed={isSelected}
                    title={`Synthesize voice note in ${opt.label}`}
                    className={`min-h-[32px] px-2.5 rounded text-xs font-medium transition-all duration-150 active:scale-95 ${
                      isSelected
                        ? 'bg-white text-[#14633F] border border-[#DCE6DF] shadow-sm'
                        : 'text-[#4A5D52] hover:text-[#17211B]'
                    } disabled:opacity-50`}
                  >
                    <span>{opt.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Mobile Compact Language Selector (< 640px) */}
            <div className="sm:hidden relative">
              <label htmlFor="consultation-lang-mobile" className="sr-only">
                Voice instruction language
              </label>
              <select
                id="consultation-lang-mobile"
                value={selectedLanguage}
                disabled={recording || processing}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="min-h-[40px] pl-2.5 pr-6 bg-[#F3F7F4] border border-[#DCE6DF] rounded-lg text-xs font-medium text-[#14633F] focus:border-[#14633F] outline-none"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Transcript Content Area */}
          <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
            {processing && (
              <div className="p-3 bg-[#F3F7F4] border-b border-[#DCE6DF] text-xs font-medium text-[#14633F] flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{statusText || 'Extracting clinical prescription from dialogue…'}</span>
              </div>
            )}

            <LiveTranscript
              lines={lines}
              subscribeInterim={ws.subscribeInterim}
              status={ws.status}
              error={ws.error}
              isRecording={recording}
            />
          </div>

          {/* Bottom Recording Bar */}
          <AudioRecorder
            disabled={processing}
            isProcessing={processing}
            onStart={handleStartConsultation}
            onChunk={(pcmBuffer) => ws.sendAudioChunk(pcmBuffer)}
            onStop={handleProcessConsultation}
            onReset={handleResetSession}
          />
        </div>

        {/* RIGHT COLUMN: The Rx Sheet (Paper-Like Prescription Pad) */}
        <div
          className={`w-full md:w-[420px] lg:w-[460px] xl:w-[500px] shrink-0 h-full min-h-0 overflow-y-auto bg-white ${
            mobileTab === 'transcript' ? 'hidden md:block' : 'block'
          }`}
        >
          {/* Mobile Rx Tab Switcher Header */}
          <div className="md:hidden h-14 px-3 border-b border-[#DCE6DF] flex items-center justify-between gap-2 bg-[#F3F7F4] shrink-0">
            <button
              type="button"
              onClick={() => setMobileTab('transcript')}
              className="btn-secondary min-h-[44px] px-3 rounded-lg border border-[#DCE6DF] bg-white text-xs font-medium text-[#14633F] flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Transcript</span>
            </button>
            <span className="text-xs font-semibold text-[#17211B] pr-2">
              Prescription Pad {prescription ? `(${prescription.prescription.length})` : ''}
            </span>
          </div>

          {prescription ? (
            <PrescriptionReview
              data={prescription}
              onChange={handleEdit}
              approved={approved}
              onApprove={() => setApproved(true)}
              onSendWhatsApp={() => setShareOpen(true)}
            />
          ) : (
            /* Empty paper prescription waiting for consultation dialogue */
            <div className="p-6 sm:p-8 min-h-full flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between border-b-2 border-[#17211B] pb-3 mb-6">
                  <div className="flex items-baseline gap-3">
                    <span className="font-serif text-3xl font-semibold text-[#14633F] italic select-none">
                      ℞
                    </span>
                    <div>
                      <h2 className="font-serif text-base font-semibold text-[#17211B] tracking-tight">
                        DocScribeAI Health Center
                      </h2>
                      <p className="text-xs text-[#4A5D52]">Outpatient clinical prescription</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 py-8 text-center text-[#4A5D52]">
                  <p className="font-serif text-base italic text-[#17211B]">
                    Awaiting clinical dialogue
                  </p>
                  <p className="text-xs max-w-xs mx-auto leading-relaxed">
                    Patient demographics, provisional diagnosis, and prescribed medicines will fill in here as the doctor speaks.
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-[#DCE6DF] text-center">
                <p className="text-xs text-[#4A5D52]">
                  Speak clearly during the consultation to automatically populate the prescription.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Send to WhatsApp Dialog Modal */}
      <WhatsAppModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        approved={approved}
        onPrepare={handlePrepare}
      />
    </DashboardLayout>
  )
}
