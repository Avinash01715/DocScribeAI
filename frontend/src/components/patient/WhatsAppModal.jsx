import { useEffect, useState } from 'react'
import { CheckCircle2, Download, Eye, EyeOff, FileText, Loader2, Music, Share2, Sparkles, X } from 'lucide-react'
import VoicePlayer from './VoicePlayer'

/**
 * WhatsAppIcon - Official SVG Glyph
 */
export function WhatsAppIcon({ className = "h-4 w-4", ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

const DEFAULT_COUNTRY_CODE = '91'

// Normalize input phone number to 12-digit Indian E.164 without plus sign
function normalizeIndianPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^0+/, '')
  if (digits.length === 10) return `${DEFAULT_COUNTRY_CODE}${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return ''
}

// Modal dialog managing patient phone input, artifact generation, and WhatsApp file dispatch
export default function WhatsAppModal({ open, onClose, approved, onPrepare }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [showPdfEmbed, setShowPdfEmbed] = useState(false)

  const [audioFile, setAudioFile] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)
  const [loadingFiles, setLoadingFiles] = useState(false)

  // Derived links and text from backend dispatch result
  const audioUrl = result?.voice_note?.audio_url || result?.audio_url || null
  const pdfUrl = result?.pdf_receipt?.url || result?.pdf_url || null
  const deepLink = result?.whatsapp_deep_link || null
  const scriptText = result?.voice_note?.script || result?.narrative_text || ''

  // Pre-fetch actual binary files (Audio MP3 and PDF) as File objects for Web Share API
  useEffect(() => {
    if (!audioUrl && !pdfUrl) return
    let cancelled = false
    setLoadingFiles(true)

    const fetchBlobs = async () => {
      try {
        if (audioUrl) {
          const res = await fetch(audioUrl)
          if (res.ok) {
            const blob = await res.blob()
            const file = new File([blob], 'prescription_voice_note.mp3', { type: 'audio/mpeg' })
            if (!cancelled) setAudioFile(file)
          }
        }
        if (pdfUrl) {
          const res = await fetch(pdfUrl)
          if (res.ok) {
            const blob = await res.blob()
            const file = new File([blob], 'prescription.pdf', { type: 'application/pdf' })
            if (!cancelled) setPdfFile(file)
          }
        }
      } catch (err) {
        console.warn('[DocScribeAI] Pre-fetching media files failed:', err)
      } finally {
        if (!cancelled) setLoadingFiles(false)
      }
    }

    fetchBlobs()

    return () => {
      cancelled = true
      setAudioFile(null)
      setPdfFile(null)
    }
  }, [audioUrl, pdfUrl])

  // Reset modal state and notify parent on close
  const handleClose = () => {
    setError('')
    setResult(null)
    setShowPdfEmbed(false)
    setAudioFile(null)
    setPdfFile(null)
    onClose()
  }

  // Listen for Escape keyboard shortcut to close modal
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && handleClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!open) return null

  const normalized = normalizeIndianPhone(phone)

  // Trigger backend generation of PDF, vernacular TTS voice note, and WhatsApp links
  const handleDispatch = async () => {
    setBusy(true)
    setError('')
    try {
      setResult(await onPrepare(normalized))
    } catch (e) {
      setError(e.message || 'Dispatch failed.')
    } finally {
      setBusy(false)
    }
  }

  // Share actual Audio file (.mp3) directly to WhatsApp or native share sheet
  const shareAudioFile = async () => {
    setError('')
    if (audioFile && typeof navigator.canShare === 'function' && navigator.canShare({ files: [audioFile] })) {
      try {
        await navigator.share({
          files: [audioFile],
          title: 'Prescription Voice Note',
        })
        return
      } catch (e) {
        if (e.name === 'AbortError') return
        console.warn('Audio share error:', e)
      }
    }
    // Fallback: download audio directly
    if (audioUrl) {
      const a = document.createElement('a')
      a.href = audioUrl
      a.download = 'prescription_voice_note.mp3'
      a.target = '_blank'
      a.click()
    }
  }

  // Share actual Prescription PDF file (.pdf) directly to WhatsApp or native share sheet
  const sharePdfFile = async () => {
    setError('')
    if (pdfFile && typeof navigator.canShare === 'function' && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: 'Prescription PDF',
        })
        return
      } catch (e) {
        if (e.name === 'AbortError') return
        console.warn('PDF share error:', e)
      }
    }
    // Fallback: download PDF directly
    if (pdfUrl) {
      const a = document.createElement('a')
      a.href = pdfUrl
      a.download = 'prescription.pdf'
      a.target = '_blank'
      a.click()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send to Patient"
    >
      <div className="max-h-[92vh] w-full space-y-3.5 overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 sm:max-w-md sm:rounded-2xl shadow-xl">

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#25D366]">
              <WhatsAppIcon className="h-4.5 w-4.5" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Send Prescription &amp; Voice Note</h2>
          </div>
          <button onClick={handleClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition">
            <X size={16} />
          </button>
        </div>

        {/* Doctor approval requirement warning */}
        {!approved && (
          <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 font-bold">
            Doctor approval required before sending.
          </p>
        )}

        {/* Patient mobile phone number input field */}
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-700">Patient WhatsApp (+91)</span>
          <div className="relative">
            <span className="absolute left-3.5 top-2 font-mono text-xs font-bold text-slate-400">+91</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder=""
              className="w-full rounded-xl border border-slate-300 bg-slate-50 pl-11 pr-3 py-1.5 font-mono text-xs font-bold text-slate-900 outline-none focus:border-teal-600 focus:bg-white transition"
            />
          </div>
          {phone && !normalized && (
            <span className="mt-1 block text-[11px] font-bold text-rose-700">Enter a valid 10-digit number.</span>
          )}
        </label>

        {/* Button triggering PDF and audio generation */}
        <button
          onClick={handleDispatch}
          disabled={!approved || !normalized || busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-40 transition"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          <span>{busy ? 'Generating…' : result ? 'Regenerate Files' : 'Generate Voice & PDF Files'}</span>
        </button>

        {/* Dispatch error display */}
        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs font-bold text-rose-800">{error}</p>
        )}

        {/* Output Section with direct file sending buttons */}
        {result && (
          <div className="space-y-3 pt-1">

            {/* Recipient verification banner */}
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>Files ready for +{normalized}</span>
            </div>

            {/* In-modal voice player preview */}
            {audioUrl && <VoicePlayer src={audioUrl} script={scriptText} />}

            {/* Two Direct File Dispatch Buttons */}
            <div className="space-y-2 pt-1">
              {/* Button 1: Send Actual Audio File */}
              {audioUrl && (
                <button
                  onClick={shareAudioFile}
                  disabled={loadingFiles && !audioFile}
                  title="Send Actual MP3 Audio Voice Note to WhatsApp"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1ebe5d] shadow-xs transition"
                >
                  <Music size={15} />
                  <span>Send Audio File (.mp3) to WhatsApp</span>
                </button>
              )}

              {/* Button 2: Send Actual PDF File */}
              {pdfUrl && (
                <button
                  onClick={sharePdfFile}
                  disabled={loadingFiles && !pdfFile}
                  title="Send Actual PDF Document to WhatsApp"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 shadow-xs transition"
                >
                  <FileText size={15} />
                  <span>Send PDF Prescription to WhatsApp</span>
                </button>
              )}
            </div>

            {/* In-browser PDF preview iframe */}
            {pdfUrl && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden mt-2">
                <div className="flex w-full items-center justify-between px-3.5 py-2">
                  <button
                    onClick={() => setShowPdfEmbed(!showPdfEmbed)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-teal-700 transition"
                  >
                    {showPdfEmbed ? <EyeOff size={14} className="text-teal-600" /> : <Eye size={14} className="text-teal-600" />}
                    <span>{showPdfEmbed ? 'Close Prescription Preview' : 'Preview Prescription'}</span>
                  </button>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download="prescription.pdf"
                    className="flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:underline"
                  >
                    <Download size={12} />
                    <span>Download</span>
                  </a>
                </div>
                {showPdfEmbed && (
                  <div className="border-t border-slate-200 bg-white">
                    <iframe src={pdfUrl} title="Prescription PDF" className="h-60 w-full" />
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
