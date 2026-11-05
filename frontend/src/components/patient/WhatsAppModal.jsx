import { useEffect, useState } from 'react'
import { Download, Loader2, MessageCircle, X } from 'lucide-react'
import VoicePlayer from './VoicePlayer'

const DEFAULT_COUNTRY_CODE = '91' // India

// 10 digit ka number ho to country code laga do, warna jaisa hai waisa (11-15 digit)
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^0+/, '') // shuru ke 0 hata do
  if (digits.length === 10) return `${DEFAULT_COUNTRY_CODE}${digits}`
  if (digits.length >= 11 && digits.length <= 15) return digits
  return ''
}

/**
 * Props:
 *  open, onClose
 *  approved  -> false ho to sab band (doctor ke approval ke bina kuch share nahi)
 *  onPrepare(phone) -> async function jo voice + PDF + WhatsApp link banata hai
 *                      aur {voice_note, pdf_receipt, whatsapp_deep_link} lautata hai.
 *                      Day 5: nakli. Day 6: backend ka /whatsapp/dispatch
 */
export default function WhatsAppModal({ open, onClose, approved, onPrepare }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  // Modal har baar khulne par fresh state
  useEffect(() => {
    if (open) {
      setError('')
      setResult(null)
    }
  }, [open])

  // Escape dabane par band
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const normalized = normalizePhone(phone)

  const prepare = async () => {
    setBusy(true)
    setError('')
    try {
      setResult(await onPrepare(normalized))
    } catch (e) {
      setError(e.message || 'Kuch gadbad ho gayi. Dobara try karein.')
    } finally {
      setBusy(false)
    }
  }

  const audioUrl = result?.voice_note?.audio_url || null
  const pdfUrl = result?.pdf_receipt?.url || null
  const deepLink = result?.whatsapp_deep_link

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Patient ko bhejein">
      <div className="max-h-[90vh] w-full space-y-4 overflow-y-auto rounded-t-2xl border border-slate-700 bg-panel p-5 sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Patient ko bhejein</h2>
          <button onClick={onClose} aria-label="Band karein" className="text-slate-400 hover:text-slate-100">
            <X size={20} />
          </button>
        </div>

        {!approved && (
          <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            Doctor ke approval ke bina kuch share nahi ho sakta. Pehle prescription approve karein.
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Patient ka WhatsApp number</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="98765 43210"
            className="w-full rounded-lg border border-slate-700 bg-ink px-3 py-2 outline-none focus:border-brand"
          />
          {phone && !normalized && <span className="mt-1 block text-xs text-rose-300">Number sahi nahi lag raha (10 digit ya country code ke saath).</span>}
        </label>

        <button
          onClick={prepare}
          disabled={!approved || !normalized || busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && <Loader2 size={18} className="animate-spin" />}
          {busy ? 'Ban raha hai…' : result ? 'Dobara banayein' : 'Voice aur PDF banayein'}
        </button>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {result && (
          <>
            {/* Hindi script dikhate hain taaki doctor padhkar check kar sake */}
            <div>
              <p className="text-xs text-slate-400">Voice note ki script</p>
              <p className="mt-1 rounded-lg bg-ink/60 p-3 text-sm">{result.voice_note?.script}</p>
              {result.voice_note?.synthesized === false && (
                <p className="mt-1 text-xs text-slate-500">Ye asli TTS awaaz nahi, demo audio hai.</p>
              )}
            </div>

            <VoicePlayer src={audioUrl} />

            <div className="flex flex-wrap gap-3">
              {pdfUrl ? (
                <a href={pdfUrl} download className="flex items-center gap-2 rounded-full border border-slate-600 px-5 py-2.5 hover:bg-white/5">
                  <Download size={18} /> PDF download
                </a>
              ) : (
                <span className="flex items-center gap-2 rounded-full border border-slate-700 px-5 py-2.5 text-sm text-slate-500">
                  <Download size={18} /> PDF ka link abhi nahi
                </span>
              )}
              <a href={deepLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-ink hover:opacity-90">
                <MessageCircle size={18} /> WhatsApp kholein
              </a>
            </div>
            <p className="text-xs text-slate-500">WhatsApp mein sirf text khulta hai. PDF aur audio apne aap attach nahi hote.</p>
          </>
        )}
      </div>
    </div>
  )
}