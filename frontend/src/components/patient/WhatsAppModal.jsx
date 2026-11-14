import { useEffect, useState } from 'react'
import { Check, Download, Eye, EyeOff, FileText, Loader2, Music, X } from 'lucide-react'
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
  const [showPdfEmbed, setShowPdfEmbed] = useState(false)
  const [sentToast, setSentToast] = useState(false)

  const [audioFile, setAudioFile] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)
  const [loadingFiles, setLoadingFiles] = useState(false)

  const audioUrl = result?.voice_note?.audio_url || result?.audio_url || null
  const pdfUrl = result?.pdf_receipt?.url || result?.pdf_url || null
  const scriptText = result?.voice_note?.script || result?.narrative_text || ''

  useEffect(() => {
    if (!audioUrl && !pdfUrl) return
    let cancelled = false

    const fetchBlobs = async () => {
      setLoadingFiles(true)
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
        console.warn('[DocScribe] Pre-fetching media failed:', err)
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

  const handleClose = () => {
    setError('')
    setResult(null)
    setShowPdfEmbed(false)
    setSentToast(false)
    setAudioFile(null)
    setPdfFile(null)
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && handleClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!open) return null

  const normalized = normalizeIndianPhone(phone)

  // Primary Action: Send to patient
  const handleDispatch = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await onPrepare(normalized)
      setResult(data)
      setSentToast(true)
      setTimeout(() => setSentToast(false), 3000)
    } catch (e) {
      setError(e.message || 'Dispatch failed.')
    } finally {
      setBusy(false)
    }
  }

  const shareAudioFile = async () => {
    setError('')
    if (audioFile && typeof navigator.canShare === 'function' && navigator.canShare({ files: [audioFile] })) {
      try {
        await navigator.share({
          files: [audioFile],
          title: 'Prescription voice note',
        })
        setSentToast(true)
        setTimeout(() => setSentToast(false), 3000)
        return
      } catch (e) {
        if (e.name === 'AbortError') return
      }
    }
    if (audioUrl) {
      const a = document.createElement('a')
      a.href = audioUrl
      a.download = 'prescription_voice_note.mp3'
      a.target = '_blank'
      a.click()
    }
  }

  const sharePdfFile = async () => {
    setError('')
    if (pdfFile && typeof navigator.canShare === 'function' && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: 'Prescription PDF',
        })
        setSentToast(true)
        setTimeout(() => setSentToast(false), 3000)
        return
      } catch (e) {
        if (e.name === 'AbortError') return
      }
    }
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Send prescription to patient"
    >
      <div className="w-full h-full sm:h-auto sm:max-w-lg sm:max-h-[90vh] sm:rounded-2xl bg-white border-t sm:border border-[#DCE6DF] flex flex-col justify-between overflow-hidden shadow-2xl text-[#17211B]">
        {/* Modal header */}
        <div className="h-14 px-5 sm:px-6 border-b border-[#DCE6DF] flex items-center justify-between shrink-0 bg-white">
          <div>
            <h2 className="text-base font-semibold text-[#17211B]">
              Send to patient
            </h2>
            <p className="text-xs text-[#4A5D52]">
              Clinical prescription and voice instructions via WhatsApp
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
            className="btn-icon min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#4A5D52] hover:text-[#17211B] hover:bg-[#F3F7F4]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable modal body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Doctor approval check */}
          {!approved && (
            <p role="alert" className="p-2.5 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-[#B45309] text-xs font-medium">
              Doctor approval required before sending.
            </p>
          )}

          {/* Patient WhatsApp phone number */}
          <label className="block">
            <span className="block text-xs font-medium text-[#4A5D52] mb-1">
              Patient WhatsApp (+91)
            </span>
            <div className="relative">
              <span className="absolute left-3 top-3 font-mono text-xs text-[#4A5D52]">
                +91
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                className="w-full min-h-[44px] bg-white border border-[#DCE6DF] rounded-xl pl-11 pr-3 py-2 font-mono text-base sm:text-sm text-[#17211B] focus:border-[#14633F] outline-none"
              />
            </div>
            {phone && !normalized && (
              <span className="mt-1 block text-xs text-[#B91C1C]">
                Please enter a 10-digit mobile number.
              </span>
            )}
          </label>

          {/* Toast confirmation message */}
          {sentToast && (
            <div className="p-2.5 rounded-lg bg-[#F3F7F4] border border-[#DCE6DF] text-xs text-[#14633F] font-semibold flex items-center justify-center gap-1.5">
              <Check className="w-4 h-4" />
              <span>Prescription and voice instructions forwarded</span>
            </div>
          )}

          {error && (
            <p role="alert" className="p-2.5 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-[#B91C1C] text-xs">
              {error}
            </p>
          )}

          {/* Artifacts preview section */}
          {result && (
            <div className="space-y-3 pt-2 border-t border-[#DCE6DF]">
              {audioUrl && (
                <VoicePlayer src={audioUrl} script={scriptText} />
              )}

              {/* Direct share sheet fallback triggers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {audioUrl && (
                  <button
                    type="button"
                    onClick={shareAudioFile}
                    disabled={loadingFiles && !audioFile}
                    className="btn-secondary min-h-[44px] px-3 rounded-xl border border-[#DCE6DF] bg-[#F3F7F4] text-[#17211B] hover:bg-white flex items-center justify-center gap-1.5 font-medium"
                  >
                    <Music className="w-4 h-4 text-[#14633F]" />
                    <span>Share voice note</span>
                  </button>
                )}

                {pdfUrl && (
                  <button
                    type="button"
                    onClick={sharePdfFile}
                    disabled={loadingFiles && !pdfFile}
                    className="btn-secondary min-h-[44px] px-3 rounded-xl border border-[#DCE6DF] bg-[#F3F7F4] text-[#17211B] hover:bg-white flex items-center justify-center gap-1.5 font-medium"
                  >
                    <FileText className="w-4 h-4 text-[#14633F]" />
                    <span>Share PDF</span>
                  </button>
                )}
              </div>

              {/* In-modal PDF Preview */}
              {pdfUrl && (
                <div className="border border-[#DCE6DF] rounded-xl overflow-hidden bg-[#F3F7F4]">
                  <div className="flex items-center justify-between px-3 py-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setShowPdfEmbed(!showPdfEmbed)}
                      className="btn-secondary min-h-[36px] px-2 rounded-lg flex items-center gap-1.5 font-medium text-[#17211B] hover:text-[#14633F]"
                    >
                      {showPdfEmbed ? (
                        <EyeOff className="w-3.5 h-3.5 text-[#4A5D52]" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-[#4A5D52]" />
                      )}
                      <span>{showPdfEmbed ? 'Hide prescription PDF' : 'Preview prescription PDF'}</span>
                    </button>
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download="prescription.pdf"
                      className="btn-secondary min-h-[36px] px-2.5 rounded-lg text-xs text-[#14633F] hover:bg-white flex items-center gap-1 font-medium"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </div>
                  {showPdfEmbed && (
                    <div className="border-t border-[#DCE6DF] bg-white">
                      <iframe src={pdfUrl} title="Prescription preview" className="w-full h-56" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky bottom "Send to patient" CTA */}
        <div className="sticky bottom-0 bg-white border-t border-[#DCE6DF] p-4 pb-safe shrink-0 shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
          <button
            type="button"
            onClick={handleDispatch}
            disabled={!approved || !normalized || busy}
            className="btn-primary w-full min-h-[48px] rounded-xl bg-[#14633F] text-white hover:bg-[#0D4A2F] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : sentToast ? (
              <Check className="w-4 h-4" />
            ) : (
              <WhatsAppIcon className="w-4 h-4 fill-white" />
            )}
            <span>{busy ? 'Preparing files…' : sentToast ? 'Sent' : 'Send to patient'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
