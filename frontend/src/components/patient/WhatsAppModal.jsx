import { useEffect, useState } from 'react'
import { CheckCircle2, Download, ExternalLink, Eye, EyeOff, FileText, Loader2, MessageCircle, Share2, X } from 'lucide-react'
import VoicePlayer from './VoicePlayer'

/**
 * WhatsAppModal.jsx - Multimodal Dispatch Orchestrator
 *
 * Implements specifications:
 * 1. Triggered by "Send Prescription" clinician action.
 * 2. Input Validation: Normalizes patient mobile numbers to Indian E.164 (+91 prefix, 10 digits).
 * 3. Dispatch Execution: Executes POST request to /api/v1/whatsapp/dispatch.
 * 4. Deep Link Trigger: Opens universal link (https://wa.me/{phone}?text=...) in new context.
 * 5. PDF Artifact Preview: Displays embedded PDF viewer with direct print/download controls.
 * 6. Multimodal delivery: Integrates VoicePlayer with spoken script accordion preview.
 */

const DEFAULT_COUNTRY_CODE = '91' // India dialing code

// Normalizes input to 10-digit Indian mobile number with +91 E.164 format
function normalizeIndianPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^0+/, '')
  if (digits.length === 10) return `${DEFAULT_COUNTRY_CODE}${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return ''
}

export default function WhatsAppModal({ open, onClose, approved, onPrepare }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [audioFile, setAudioFile] = useState(null)
  const [showPdfEmbed, setShowPdfEmbed] = useState(false)

  const audioUrl = result?.voice_note?.audio_url || null
  const pdfUrl = result?.pdf_receipt?.url || null
  const deepLink = result?.whatsapp_deep_link
  const scriptText = result?.voice_note?.script || ''

  const handleClose = () => {
    setError('')
    setResult(null)
    setShowPdfEmbed(false)
    onClose()
  }

  // Pre-fetch audio as Blob for mobile Web Share API dispatch
  useEffect(() => {
    if (!audioUrl) return
    let cancelled = false
    fetch(audioUrl)
      .then((r) => {
        if (!r.ok) throw new Error('Audio could not be fetched.')
        return r.blob()
      })
      .then((blob) => {
        if (cancelled) return
        const ext = audioUrl.split('?')[0].split('.').pop() || 'wav'
        setAudioFile(
          new File([blob], `prescription_voice_note.${ext}`, {
            type: blob.type || 'audio/wav',
          })
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [audioUrl])

  // Keyboard accessibility: Escape key closes modal
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && handleClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!open) return null

  const normalized = normalizeIndianPhone(phone)
  const canShareFile =
    !!audioFile &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [audioFile] })

  // Executes multimodal dispatch pipeline on backend
  const handleDispatch = async () => {
    setBusy(true)
    setError('')
    try {
      const dispatchResponse = await onPrepare(normalized)
      setResult(dispatchResponse)
    } catch (e) {
      setError(e.message || 'Dispatch pipeline failed. Please check backend connection.')
    } finally {
      setBusy(false)
    }
  }

  // Native share sheet trigger for mobile devices
  const shareAudioFile = async () => {
    try {
      await navigator.share({
        files: [audioFile],
        title: 'Prescription Voice Note',
      })
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError('Share sheet failed. Please download audio and dispatch manually.')
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Multimodal Dispatch Orchestrator"
    >
      <div className="max-h-[92vh] w-full space-y-4 overflow-y-auto rounded-t-2xl border border-slate-800 bg-panel p-5 sm:max-w-xl sm:rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="text-teal-400" size={20} />
            <h2 className="text-lg font-semibold text-slate-100">
              Multimodal WhatsApp Dispatch
            </h2>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-100 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Approval Safeguard Alert */}
        {!approved && (
          <p
            role="alert"
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 font-medium"
          >
            Physician approval required: Prescription must be formally approved prior to patient delivery.
          </p>
        )}

        {/* Indian E.164 Phone Number Input */}
        <div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">
              Patient WhatsApp Number (Indian E.164: +91)
            </span>
            <div className="relative">
              <span className="absolute left-3 top-2.5 font-mono text-sm font-semibold text-slate-400">
                +91
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="98765 43210"
                className="w-full rounded-lg border border-slate-800 bg-ink pl-12 pr-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-teal-400"
              />
            </div>
            {phone && !normalized && (
              <span className="mt-1 block text-xs text-rose-300">
                Please enter a valid 10-digit Indian mobile number.
              </span>
            )}
          </label>
        </div>

        {/* Action Button: Generate Multimodal Artifacts */}
        <button
          onClick={handleDispatch}
          disabled={!approved || !normalized || busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-teal-500 px-5 py-3 font-semibold text-ink shadow-lg shadow-teal-500/20 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40 transition"
        >
          {busy && <Loader2 size={18} className="animate-spin" />}
          {busy
            ? 'Generating Timbre Audio & FPDF2 PDF…'
            : result
              ? 'Regenerate Multimodal Package'
              : 'Generate Voice Note & PDF Prescription'}
        </button>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"
          >
            {error}
          </p>
        )}

        {/* Dispatch Artifact Outputs */}
        {result && (
          <div className="space-y-4 pt-2">
            {/* Status confirmation */}
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
              <CheckCircle2 size={16} />
              <span>Artifacts successfully generated for +{normalized}.</span>
            </div>

            {/* Voice Player with Spoken Text Accordion */}
            <VoicePlayer src={audioUrl} script={scriptText} />

            {/* Mobile Share Sheet / Direct Audio Download */}
            {audioUrl && (
              <div className="flex flex-wrap gap-2.5">
                {canShareFile && (
                  <button
                    onClick={shareAudioFile}
                    className="flex items-center gap-2 rounded-full bg-teal-500 px-4 py-2 text-xs font-semibold text-ink hover:bg-teal-400"
                  >
                    <Share2 size={15} /> Share Voice Note Directly
                  </button>
                )}
                <a
                  href={audioUrl}
                  download="patient_instructions.wav"
                  className="flex items-center gap-1.5 rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-white/5"
                >
                  <Download size={14} /> Download Audio WAV
                </a>
              </div>
            )}

            {/* ---- PDF Artifact Controls & Embedded Viewer ---- */}
            <div className="rounded-xl border border-slate-800 bg-ink/60 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <FileText size={15} className="text-teal-400" />
                  FPDF2 Clinical Prescription PDF
                </span>

                <div className="flex items-center gap-2">
                  {pdfUrl && (
                    <button
                      onClick={() => setShowPdfEmbed(!showPdfEmbed)}
                      className="flex items-center gap-1 rounded border border-slate-700 bg-panel px-2.5 py-1 text-xs text-slate-300 hover:text-teal-300 transition"
                    >
                      {showPdfEmbed ? <EyeOff size={13} /> : <Eye size={13} />}
                      {showPdfEmbed ? 'Hide Preview' : 'Embedded Preview'}
                    </button>
                  )}

                  {pdfUrl && (
                    <a
                      href={pdfUrl}
                      download="Rx_Prescription.pdf"
                      className="flex items-center gap-1 rounded border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 text-xs font-semibold text-teal-300 hover:bg-teal-500/20"
                    >
                      <Download size={13} /> Download PDF
                    </a>
                  )}
                </div>
              </div>

              {/* Embedded PDF Viewer */}
              {showPdfEmbed && pdfUrl && (
                <div className="overflow-hidden rounded-lg border border-slate-700 bg-white">
                  <iframe
                    src={pdfUrl}
                    title="Prescription PDF Viewer"
                    className="h-64 w-full"
                  />
                </div>
              )}
            </div>

            {/* Universal Deep Link Action (https://wa.me/{phone}?text=...) */}
            {deepLink && (
              <div className="pt-1">
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-teal-400 bg-teal-500/10 px-5 py-3 font-semibold text-teal-300 shadow-md hover:bg-teal-500/20 transition"
                >
                  <MessageCircle size={18} />
                  Open WhatsApp Web (wa.me Deep Link)
                  <ExternalLink size={14} />
                </a>
                <p className="mt-2 text-center text-[11px] text-slate-400">
                  Transmits structured medication breakdown, PDF receipt link, and synthesized Timbre audio link directly to the patient's WhatsApp chat.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
