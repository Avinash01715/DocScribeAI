import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Share2,
  X,
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { WhatsAppIcon } from '../components/patient/WhatsAppModal'
import {
  buildSharePayload,
  buildWhatsAppShareUrl,
  fetchPrescriptionHistory,
  resolveAssetUrl,
  sanitizePhoneE164,
} from '../services/historyApi'
import { getLanguageMeta } from '../utils/languages'

function formatDateTime(isoString) {
  if (!isoString) return 'Recent'
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return String(isoString)
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d)
  } catch {
    return String(isoString)
  }
}

function formatTime(s) {
  if (!Number.isFinite(s) || s <= 0) return '0:00'
  const mins = Math.floor(s / 60)
  const secs = Math.floor(s % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function Prescriptions() {
  const navigate = useNavigate()

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Audio player controller
  const audioRef = useRef(null)
  const [activeAudioId, setActiveAudioId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioBuffering, setAudioBuffering] = useState(false)

  // Copy phone state
  const [copiedPhoneId, setCopiedPhoneId] = useState(null)

  const loadHistory = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError('')

    try {
      const data = await fetchPrescriptionHistory(25)
      setRecords(data)
    } catch (err) {
      console.error('Prescriptions fetch failed:', err)
      setError(err.message || 'Unable to load prescription history.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    let ignore = false
    fetchPrescriptionHistory(25)
      .then((data) => {
        if (!ignore) {
          setRecords(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Unable to load prescription history.')
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [])

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return records

    return records.filter((item) => {
      const name = (item.patient_name || '').toLowerCase()
      const phone = (item.patient_phone || item.phone_number || '').toLowerCase()
      const diag = (item.diagnosis || '').toLowerCase()
      return name.includes(q) || phone.includes(q) || diag.includes(q)
    })
  }, [records, searchQuery])

  const togglePlayAudio = (record) => {
    const audio = audioRef.current
    if (!audio) return

    const resolvedUrl = resolveAssetUrl(record.audio_url)
    if (!resolvedUrl) return

    if (activeAudioId === record.id) {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        audio.play().then(() => setIsPlaying(true)).catch((e) => console.warn('Play interrupted:', e))
      }
      return
    }

    audio.pause()
    setActiveAudioId(record.id)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setAudioBuffering(true)

    audio.src = resolvedUrl
    audio.load()
    audio
      .play()
      .then(() => {
        setIsPlaying(true)
        setAudioBuffering(false)
      })
      .catch((err) => {
        console.warn('Audio auto-play failed:', err)
        setAudioBuffering(false)
        setIsPlaying(false)
      })
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime)
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
      setAudioBuffering(false)
    }
  }

  const handleAudioEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
    setActiveAudioId(null)
  }

  const handleAudioError = () => {
    setIsPlaying(false)
    setAudioBuffering(false)
    setActiveAudioId(null)
  }

  const handleNativeShare = async (record) => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const payload = buildSharePayload(record)
        await navigator.share(payload)
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.warn('Share rejected:', e)
        }
      }
    }
  }

  const handleCopyPhone = (id, phone) => {
    if (!phone) return
    const sanitized = sanitizePhoneE164(phone)
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`+${sanitized}`).then(() => {
        setCopiedPhoneId(id)
        setTimeout(() => setCopiedPhoneId(null), 1800)
      })
    }
  }

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <DashboardLayout>
      {/* Centralized hidden audio player */}
      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
        onError={handleAudioError}
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#DCE6DF]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-[#17211B] tracking-tight">
              Prescription history
            </h1>
            {!loading && (
              <span className="text-xs text-[#4A5D52] bg-[#F3F7F4] border border-[#DCE6DF] px-2 py-0.5 rounded-full">
                {records.length} {records.length === 1 ? 'record' : 'records'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[#4A5D52]">
            Past consultations, generated prescriptions, and vernacular voice instructions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadHistory(true)}
            disabled={refreshing || loading}
            aria-label="Refresh prescription list"
            title="Refresh prescriptions"
            className="btn-secondary min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DF] bg-white text-[#17211B] hover:bg-[#F3F7F4] text-xs font-medium flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#4A5D52] ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/consultation')}
            className="btn-primary min-h-[44px] px-4 rounded-xl bg-[#14633F] text-white hover:bg-[#0D4A2F] text-xs font-medium flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            <span>New consultation</span>
          </button>
        </div>
      </div>

      {/* Search Bar (16px font size prevents auto-zoom on mobile) */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-3.5 text-[#4A5D52]" strokeWidth={1.75} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient name, phone, or diagnosis…"
            className="w-full min-h-[44px] pl-9 pr-9 bg-white border border-[#DCE6DF] rounded-xl text-base sm:text-xs text-[#17211B] placeholder:text-[#4A5D52] focus:border-[#14633F] outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="btn-icon min-w-[36px] min-h-[36px] flex items-center justify-center absolute right-1.5 top-1 text-[#4A5D52] hover:text-[#17211B]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between p-3 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-[#B91C1C] text-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadHistory(true)}
            className="px-2.5 py-1 rounded bg-white border border-[#FECACA] text-[#B91C1C] font-medium hover:bg-[#FEE2E2]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Clean Table on #FFFFFF with #F3F7F4 Header and #DCE6DF Dividers */}
      <div className="mt-5 border border-[#DCE6DF] rounded-lg overflow-hidden bg-white">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#4A5D52]">
            Loading prescription history…
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#4A5D52]">
            <p className="font-medium text-[#17211B]">
              No prescriptions yet. Start a consultation.
            </p>
            <p className="mt-1 text-xs text-[#4A5D52]">
              Completed consultations will appear in this archive.
            </p>
            <button
              type="button"
              onClick={() => navigate('/consultation')}
              className="mt-4 min-h-[40px] px-4 rounded-lg bg-[#14633F] text-white hover:bg-[#0D4A2F] text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Start consultation</span>
            </button>
          </div>
        ) : (
          <>
            {/* 1. Mobile Ruled Card View (< 768px) - Eliminates horizontal table scroll */}
            <div className="md:hidden divide-y divide-[#DCE6DF]">
              {filteredRecords.map((item) => {
                const isCurrentAudio = activeAudioId === item.id
                const itemPdfUrl = resolveAssetUrl(item.pdf_url)
                const itemAudioUrl = resolveAssetUrl(item.audio_url)
                const waShareUrl = buildWhatsAppShareUrl(item)
                const phoneRaw = item.patient_phone || item.phone_number || ''
                const isCopied = copiedPhoneId === item.id
                const langMeta = getLanguageMeta(item.language)

                return (
                  <div key={item.id} className="p-4 space-y-3 bg-white">
                    {/* Header: Name + Date/Time */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[#17211B] truncate">
                          {item.patient_name || 'Patient'}
                        </h3>
                        {phoneRaw && (
                          <button
                            type="button"
                            onClick={() => handleCopyPhone(item.id, phoneRaw)}
                            title="Click to copy phone number"
                            className="font-mono text-xs text-[#4A5D52] hover:text-[#14633F] mt-0.5 inline-flex items-center gap-1"
                          >
                            <span>+{sanitizePhoneE164(phoneRaw)}</span>
                            {isCopied && <span className="text-[#14633F] font-sans font-medium text-[11px]">Copied</span>}
                          </button>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs text-[#4A5D52] block">
                          {formatDateTime(item.timestamp || item.created_at)}
                        </span>
                        <span className="font-mono text-[11px] text-[#4A5D52]">#{item.id}</span>
                      </div>
                    </div>

                    {/* Diagnosis & Language Tag */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-serif text-sm text-[#17211B] truncate flex-1">
                        {item.diagnosis || 'Clinical consultation'}
                      </span>
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F3F7F4] text-[#14633F] border border-[#DCE6DF]">
                        {langMeta.label}
                      </span>
                    </div>

                    {/* Inline Voice Note Player */}
                    {itemAudioUrl && (
                      <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#F3F7F4] border border-[#DCE6DF]">
                        <button
                          type="button"
                          onClick={() => togglePlayAudio(item)}
                          aria-label={isCurrentAudio && isPlaying ? 'Pause audio' : 'Play audio'}
                          className="btn-icon min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-[#14633F] text-white"
                        >
                          {isCurrentAudio && audioBuffering ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isCurrentAudio && isPlaying ? (
                            <Pause className="w-3.5 h-3.5 fill-white" />
                          ) : (
                            <Play className="w-3.5 h-3.5 ml-0.5 fill-white" />
                          )}
                        </button>

                        <span className="font-mono text-xs text-[#4A5D52] tabular-nums">
                          {isCurrentAudio
                            ? `${formatTime(currentTime)} / ${formatTime(duration)}`
                            : 'Voice instruction'}
                        </span>

                        <a
                          href={itemAudioUrl}
                          download={`rx_audio_${item.id}.mp3`}
                          title="Download audio"
                          className="btn-icon min-w-[36px] min-h-[36px] flex items-center justify-center text-[#4A5D52] hover:text-[#17211B]"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    )}

                    {/* Touch-Friendly Action Buttons (min-h-[44px]) */}
                    <div className="flex items-center gap-2 pt-1">
                      {itemPdfUrl && (
                        <a
                          href={itemPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View PDF"
                          className="btn-secondary flex-1 min-h-[44px] px-3 rounded-xl border border-[#DCE6DF] bg-white text-[#17211B] hover:bg-[#F3F7F4] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#14633F]" />
                          <span>PDF</span>
                          <ExternalLink className="w-3 h-3 text-[#4A5D52]" />
                        </a>
                      )}

                      <a
                        href={waShareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Send via WhatsApp"
                        className="btn-primary flex-1 min-h-[44px] px-3 rounded-xl bg-[#14633F] text-white hover:bg-[#0D4A2F] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                        <span>WhatsApp</span>
                      </a>

                      {canNativeShare && (
                        <button
                          type="button"
                          onClick={() => handleNativeShare(item)}
                          title="Share sheet"
                          className="btn-icon min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#DCE6DF] bg-white text-[#4A5D52] hover:text-[#17211B] hover:bg-[#F3F7F4]"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 2. Desktop Clean Searchable Table (hidden on mobile, visible on md:) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F3F7F4] border-b border-[#DCE6DF] text-xs font-medium text-[#4A5D52]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Date and time</th>
                    <th scope="col" className="px-4 py-3">Patient</th>
                    <th scope="col" className="px-4 py-3">Diagnosis</th>
                    <th scope="col" className="px-4 py-3">Language</th>
                    <th scope="col" className="px-4 py-3">Voice note</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE6DF]">
                  {filteredRecords.map((item) => {
                    const isCurrentAudio = activeAudioId === item.id
                    const itemPdfUrl = resolveAssetUrl(item.pdf_url)
                    const itemAudioUrl = resolveAssetUrl(item.audio_url)
                    const waShareUrl = buildWhatsAppShareUrl(item)
                    const phoneRaw = item.patient_phone || item.phone_number || ''
                    const isCopied = copiedPhoneId === item.id
                    const langMeta = getLanguageMeta(item.language)

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-[#F3F7F4]/50 transition-colors"
                      >
                        {/* Date & Time */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-[#4A5D52]">
                          <div>{formatDateTime(item.timestamp || item.created_at)}</div>
                          <div className="font-mono text-[11px] text-[#4A5D52] mt-0.5">#{item.id}</div>
                        </td>

                        {/* Patient */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-medium text-[#17211B]">
                            {item.patient_name || 'Patient'}
                          </div>
                          {phoneRaw && (
                            <button
                              type="button"
                              onClick={() => handleCopyPhone(item.id, phoneRaw)}
                              title="Click to copy phone number"
                              className="font-mono text-[11px] text-[#4A5D52] hover:text-[#14633F] mt-0.5 inline-block"
                            >
                              +{sanitizePhoneE164(phoneRaw)}
                              {isCopied && (
                                <span className="text-[#14633F] font-sans font-medium ml-1">Copied</span>
                              )}
                            </button>
                          )}
                        </td>

                        {/* Clinical Diagnosis in Source Serif 4 */}
                        <td className="px-4 py-3.5 font-serif text-sm text-[#17211B] max-w-xs">
                          {item.diagnosis || 'Clinical assessment'}
                        </td>

                        {/* Language */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 text-xs bg-[#F3F7F4] border border-[#DCE6DF] rounded text-[#17211B]">
                            {langMeta.label}
                          </span>
                        </td>

                        {/* Voice Note Player */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {itemAudioUrl ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => togglePlayAudio(item)}
                                aria-label={isCurrentAudio && isPlaying ? 'Pause audio' : 'Play audio note'}
                                className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
                                  isCurrentAudio && isPlaying
                                    ? 'bg-[#14633F] text-white'
                                    : 'bg-[#F3F7F4] border border-[#DCE6DF] text-[#14633F] hover:bg-white'
                                }`}
                              >
                                {isCurrentAudio && audioBuffering ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : isCurrentAudio && isPlaying ? (
                                  <Pause className="w-3 h-3 fill-current" />
                                ) : (
                                  <Play className="w-3 h-3 ml-0.5 fill-current" />
                                )}
                              </button>

                              <span className="font-mono text-[11px] tabular-nums text-[#4A5D52]">
                                {isCurrentAudio
                                  ? `${formatTime(currentTime)} / ${formatTime(duration)}`
                                  : 'Audio'}
                              </span>

                              <a
                                href={itemAudioUrl}
                                download={`rx_audio_${item.id}.mp3`}
                                title="Download audio"
                                className="text-[#4A5D52] hover:text-[#17211B] p-1"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#4A5D52] italic">None</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {itemPdfUrl && (
                              <a
                                href={itemPdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View PDF"
                                className="btn-secondary min-h-[36px] px-2.5 rounded-lg border border-[#DCE6DF] bg-white text-[#17211B] hover:bg-[#F3F7F4] text-xs font-medium inline-flex items-center gap-1"
                              >
                                <FileText className="w-3.5 h-3.5 text-[#14633F]" />
                                <span>PDF</span>
                                <ExternalLink className="w-2.5 h-2.5 text-[#4A5D52]" />
                              </a>
                            )}

                            <a
                              href={waShareUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Send via WhatsApp"
                              className="btn-primary min-h-[36px] px-2.5 rounded-lg bg-[#14633F] text-white hover:bg-[#0D4A2F] text-xs font-medium inline-flex items-center gap-1"
                            >
                              <WhatsAppIcon className="w-3 h-3 fill-white" />
                              <span>WhatsApp</span>
                            </a>

                            {canNativeShare && (
                              <button
                                type="button"
                                onClick={() => handleNativeShare(item)}
                                title="Share sheet"
                                className="btn-icon min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#DCE6DF] bg-white text-[#4A5D52] hover:text-[#17211B] hover:bg-[#F3F7F4]"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
