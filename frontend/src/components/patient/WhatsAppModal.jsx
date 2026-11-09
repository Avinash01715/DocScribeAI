import { useEffect, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, Loader2, Sparkles, X } from 'lucide-react'
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
  const [audioFile, setAudioFile] = useState(null)
  const [showPdfEmbed, setShowPdfEmbed] = useState(false)

  const audioUrl = result?.voice_note?.audio_url || result?.audio_url || null
  const pdfUrl = result?.pdf_receipt?.url || result?.pdf_url || null
  const deepLink = result?.whatsapp_deep_link || null
  const scriptText = result?.voice_note?.script || result?.narrative_text || ''
  const [pdfFile, setPdfFile] = useState(null)

  const handleClose = () => {
    setError('')
    setResult(null)
    setShowPdfEmbed(false)
    setAudioFile(null)
    onClose()
  }

  // Pre-fetch audio as Blob for Web Share API (MP3)
  useEffect(() => {
    if (!audioUrl) { setAudioFile(null); return }
    let cancelled = false
    fetch(audioUrl)
      .then((r) => { if (!r.ok) throw new Error('Audio fetch failed.'); return r.blob() })
      .then((blob) => {
        if (cancelled) return
        const cleanBlob = blob.type === 'audio/mpeg' ? blob : new Blob([blob], { type: 'audio/mpeg' })
        setAudioFile(new File([cleanBlob], 'prescription_voice_note.mp3', { type: 'audio/mpeg' }))
      })
      .catch((err) => console.warn('Audio prep failed:', err))
    return () => { cancelled = true }
  }, [audioUrl])

  // Pre-fetch PDF as Blob for Web Share API
  useEffect(() => {
    if (!pdfUrl) { setPdfFile(null); return }
    let cancelled = false
    fetch(pdfUrl)
      .then((r) => { if (!r.ok) throw new Error('PDF fetch failed.'); return r.blob() })
      .then((blob) => {
        if (cancelled) return
        const cleanBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })
        setPdfFile(new File([cleanBlob], 'prescription.pdf', { type: 'application/pdf' }))
      })
      .catch((err) => console.warn('PDF prep failed:', err))
    return () => { cancelled = true }
  }, [pdfUrl])

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

  // Single handler: shares voice note + PDF together
  const shareVoiceAndPdf = async () => {
    setError('')

    const canSharePdfFile =
      !!pdfFile &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [pdfFile] })

    // Try sharing both files at once via Web Share API
    if (canShareFile || canSharePdfFile) {
      const filesToShare = [
        ...(canShareFile ? [audioFile] : []),
        ...(canSharePdfFile ? [pdfFile] : []),
      ]
      try {
        await navigator.share({
          files: filesToShare,
          title: 'Prescription',
          text: scriptText || 'Namaste, aapki prescription taiyyar hai.',
        })
        return
      } catch (e) {
        if (e.name === 'AbortError') return
        // fall through to WhatsApp deep-link fallback
      }
    }

    // Fallback: open WhatsApp with voice deep-link first, then PDF message
    if (audioUrl && deepLink) {
      window.open(deepLink, '_blank', 'noopener,noreferrer')
    }

    // Send PDF as a bare URL so WhatsApp auto-renders it as a clickable link
    if (pdfUrl && normalized) {
      const msg = encodeURIComponent(
        `📋 *Prescription PDF*\n${pdfUrl}`
      )
      window.open(`https://wa.me/${normalized}?text=${msg}`, '_blank', 'noopener,noreferrer')
    }

    if (!audioUrl && !pdfUrl) {
      setError('Nothing to share.')
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

        {/* Header with WhatsApp Symbol */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#25D366]">
              <WhatsAppIcon className="h-4.5 w-4.5" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">WhatsApp Delivery</h2>
          </div>
          <button onClick={handleClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition">
            <X size={16} />
          </button>
        </div>

        {/* Approval warning */}
        {!approved && (
          <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 font-bold">
            Doctor approval required before sending.
          </p>
        )}

        {/* Phone input */}
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

        {/* Generate button */}
        <button
          onClick={handleDispatch}
          disabled={!approved || !normalized || busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-40 transition"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          <span>{busy ? 'Generating…' : result ? 'Regenerate Package' : 'Generate Voice & PDF'}</span>
        </button>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs font-bold text-rose-800">{error}</p>
        )}

        {/* Output Section */}
        {result && (
          <div className="space-y-3 pt-1">

            {/* Ready badge */}
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>Ready for +{normalized}</span>
            </div>

            {/* Voice Player */}
            {audioUrl && <VoicePlayer src={audioUrl} script={scriptText} />}

            {/* Single combined Share button */}
            {(audioUrl || pdfUrl) && (
              <button
                onClick={shareVoiceAndPdf}
                title="Share Voice Note & PDF via WhatsApp"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1ebe5d] shadow-2xs transition"
              >
                <WhatsAppIcon className="h-4 w-4 fill-white" />
                <span>Share Voice &amp; Prescription</span>
              </button>
            )}

            {/* PDF Preview Toggle with clickable link */}
            {pdfUrl && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                <div className="flex w-full items-center justify-between px-3.5 py-2">
                  <button
                    onClick={() => setShowPdfEmbed(!showPdfEmbed)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-teal-700 transition"
                  >
                    {showPdfEmbed ? <EyeOff size={14} className="text-teal-600" /> : <Eye size={14} className="text-teal-600" />}
                    <span>{showPdfEmbed ? 'Close Prescription Preview' : 'Preview Prescription'}</span>
                  </button>
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
