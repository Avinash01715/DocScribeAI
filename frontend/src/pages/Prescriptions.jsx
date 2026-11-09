import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  Calendar,
  Clock,
  Download,
  ExternalLink,
  FileAudio,
  FileText,
  Loader2,
  Pause,
  Phone,
  Pill,
  Play,
  Plus,
  RefreshCw,
  Search,
  Share2,
  User,
  Volume2,
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

/**
 * Formats ISO timestamps to standard localized clinical date/time strings
 */
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

/**
 * Formats duration seconds into mm:ss playback representation
 */
function formatTime(s) {
  if (!Number.isFinite(s) || s <= 0) return '0:00'
  const mins = Math.floor(s / 60)
  const secs = Math.floor(s % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function Prescriptions() {
  const navigate = useNavigate()

  // Data & loading state
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Shared audio playback controller
  const audioRef = useRef(null)
  const [activeAudioId, setActiveAudioId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioBuffering, setAudioBuffering] = useState(false)

  // Copy-to-clipboard toast state
  const [copiedPhoneId, setCopiedPhoneId] = useState(null)

  // Load prescription records from SQLite repository
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
      setError(err.message || 'Unable to load prescription history. Please check backend connection.')
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

  // Filter records by patient name, phone number, or clinical diagnosis
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

  // Handle centralized audio playback toggle
  const togglePlayAudio = (record) => {
    const audio = audioRef.current
    if (!audio) return

    const resolvedUrl = resolveAssetUrl(record.audio_url)
    if (!resolvedUrl) return

    // Tapping the currently playing record toggles pause/play
    if (activeAudioId === record.id) {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        audio.play().then(() => setIsPlaying(true)).catch((e) => console.warn('Play interrupted:', e))
      }
      return
    }

    // Switching to a new record
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

  // Audio element event handlers
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

  // Native share invocation
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

  // Copy phone number helper
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
      {/* Hidden global audio element for coordinated single-stream playback */}
      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
        onError={handleAudioError}
      />

      {/* Top Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Prescription History
            </h1>
            {!loading && (
              <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-800">
                <FileText size={12} className="text-teal-600" />
                {records.length} {records.length === 1 ? 'record' : 'records'}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Past OPD consultations, digital prescriptions, and vernacular voice instructions.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadHistory(true)}
            disabled={refreshing || loading}
            aria-label="Refresh prescription history"
            title="Refresh prescription records"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-teal-600' : 'text-slate-500'} />
            <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => navigate('/consultation')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700 transition"
          >
            <Plus size={15} />
            <span>New Consultation</span>
          </button>
        </div>
      </div>

      {/* Real-time Search and Filter Toolbar */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient name, phone, or diagnosis…"
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 shadow-2xs transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search query"
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {searchQuery && (
          <div className="text-[11px] font-medium text-slate-500">
            Showing <strong className="text-slate-900">{filteredRecords.length}</strong> of {records.length} matches
          </div>
        )}
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={() => loadHistory(true)}
            className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="mt-4">
        {/* Loading Skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-200" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-32 rounded bg-slate-200" />
                    <div className="h-2.5 w-24 rounded bg-slate-100" />
                  </div>
                </div>
                <div className="h-5 w-36 rounded bg-slate-100" />
                <div className="h-8 w-44 rounded bg-slate-100" />
                <div className="h-8 w-28 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredRecords.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 mb-3">
              {searchQuery ? <Search size={22} /> : <FileText size={22} />}
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              {searchQuery ? 'No matching prescriptions found' : 'No prescriptions in archive'}
            </h3>
            <p className="mt-1 max-w-sm text-xs font-medium text-slate-500">
              {searchQuery
                ? `No consultation records matched "${searchQuery}". Try searching by phone number or disease condition.`
                : 'Complete an ambient consultation to automatically synthesize regional voice notes, compile PDF receipts, and archive records.'}
            </p>
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Clear Search Filter
              </button>
            ) : (
              <button
                onClick={() => navigate('/consultation')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700 transition"
              >
                <Plus size={15} />
                <span>Start First Consultation</span>
              </button>
            )}
          </div>
        )}

        {/* Data Records View */}
        {!loading && filteredRecords.length > 0 && (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/80 font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Date &amp; Time
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Patient Details
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Clinical Diagnosis
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Voice Note (16kHz)
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Actions &amp; Delivery
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map((item) => {
                    const isCurrentAudio = activeAudioId === item.id
                    const itemPdfUrl = resolveAssetUrl(item.pdf_url)
                    const itemAudioUrl = resolveAssetUrl(item.audio_url)
                    const waShareUrl = buildWhatsAppShareUrl(item)
                    const phoneRaw = item.patient_phone || item.phone_number || ''
                    const isCopied = copiedPhoneId === item.id

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/70 transition group"
                      >
                        {/* Timestamp */}
                        <td className="px-4 py-3.5 align-top whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <Clock size={13} className="text-slate-400 shrink-0" />
                            <span>{formatDateTime(item.timestamp || item.created_at)}</span>
                          </div>
                          <span className="mt-0.5 inline-block text-[10px] font-mono text-slate-400">
                            #{item.id}
                          </span>
                        </td>

                        {/* Patient Details */}
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-start gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 border border-teal-200/60 text-teal-700 shrink-0 font-bold">
                              <User size={15} />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">
                                {item.patient_name || 'Patient'}
                              </div>
                              {phoneRaw && (
                                <button
                                  onClick={() => handleCopyPhone(item.id, phoneRaw)}
                                  title="Click to copy E.164 phone"
                                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-teal-700 transition"
                                >
                                  <Phone size={10} className="text-slate-400" />
                                  <span>+{sanitizePhoneE164(phoneRaw)}</span>
                                  {isCopied && (
                                    <span className="text-[10px] font-sans font-bold text-emerald-600 ml-1">
                                      Copied!
                                    </span>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Diagnosis & Medications */}
                        <td className="px-4 py-3.5 align-top max-w-xs">
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100/80 px-2 py-0.5 text-xs font-semibold text-slate-800">
                            {item.diagnosis || 'Clinical Assessment'}
                          </span>
                          {Number.isInteger(item.medications_count) && item.medications_count > 0 && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                              <Pill size={11} className="text-teal-600" />
                              <span>{item.medications_count} prescribed</span>
                            </div>
                          )}
                        </td>

                        {/* Voice Note Player */}
                        <td className="px-4 py-3.5 align-top whitespace-nowrap">
                          {itemAudioUrl ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => togglePlayAudio(item)}
                                aria-label={isCurrentAudio && isPlaying ? 'Pause audio' : 'Play audio note'}
                                className={`flex h-8 w-8 items-center justify-center rounded-full transition shadow-2xs ${
                                  isCurrentAudio && isPlaying
                                    ? 'bg-teal-600 text-white'
                                    : 'bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100'
                                }`}
                              >
                                {isCurrentAudio && audioBuffering ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : isCurrentAudio && isPlaying ? (
                                  <Pause size={14} />
                                ) : (
                                  <Play size={14} className="ml-0.5" />
                                )}
                              </button>

                              <div className="text-[11px] font-mono tabular-nums text-slate-500">
                                {isCurrentAudio ? (
                                  <span>
                                    {formatTime(currentTime)} / {formatTime(duration)}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-slate-400">
                                    <FileAudio size={12} /> Audio Note
                                  </span>
                                )}
                              </div>

                              <a
                                href={itemAudioUrl}
                                download={`rx_audio_${item.id}.mp3`}
                                title="Download audio note"
                                className="text-slate-400 hover:text-slate-700 transition p-1"
                              >
                                <Download size={13} />
                              </a>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">None generated</span>
                          )}
                        </td>

                        {/* Quick Actions & Delivery */}
                        <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {/* PDF View Link */}
                            {itemPdfUrl && (
                              <a
                                href={itemPdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View PDF Prescription"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-700 shadow-2xs transition"
                              >
                                <FileText size={13} className="text-teal-600" />
                                <span>PDF</span>
                                <ExternalLink size={10} className="text-slate-400" />
                              </a>
                            )}

                            {/* Synchronous Direct WhatsApp Navigation (Zero Popup Suppression) */}
                            <a
                              href={waShareUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Send to patient via WhatsApp"
                              className="inline-flex items-center gap-1 rounded-lg bg-[#25D366] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#1ebe5d] shadow-2xs transition"
                            >
                              <WhatsAppIcon className="h-3.5 w-3.5 fill-white" />
                              <span>WhatsApp</span>
                            </a>

                            {/* Native Web Share API */}
                            {canNativeShare && (
                              <button
                                onClick={() => handleNativeShare(item)}
                                title="Native Share sheet"
                                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 shadow-2xs transition"
                              >
                                <Share2 size={13} />
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

            {/* Mobile Stacked Card View */}
            <div className="md:hidden space-y-3">
              {filteredRecords.map((item) => {
                const isCurrentAudio = activeAudioId === item.id
                const itemPdfUrl = resolveAssetUrl(item.pdf_url)
                const itemAudioUrl = resolveAssetUrl(item.audio_url)
                const waShareUrl = buildWhatsAppShareUrl(item)
                const phoneRaw = item.patient_phone || item.phone_number || ''
                const isCopied = copiedPhoneId === item.id

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
                  >
                    {/* Card Top: Patient info & Date */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 border border-teal-200/60 text-teal-700 font-bold">
                          <User size={16} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 leading-tight">
                            {item.patient_name || 'Patient'}
                          </h4>
                          {phoneRaw && (
                            <button
                              onClick={() => handleCopyPhone(item.id, phoneRaw)}
                              className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-teal-700"
                            >
                              <Phone size={10} className="text-slate-400" />
                              <span>+{sanitizePhoneE164(phoneRaw)}</span>
                              {isCopied && (
                                <span className="text-[10px] font-sans font-bold text-emerald-600">
                                  Copied!
                                </span>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                          <Calendar size={11} className="text-slate-400" />
                          {formatDateTime(item.timestamp || item.created_at)}
                        </span>
                        <div className="text-[10px] font-mono text-slate-400">#{item.id}</div>
                      </div>
                    </div>

                    {/* Diagnosis & Count */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-800">
                        {item.diagnosis || 'Clinical OPD Assessment'}
                      </span>
                      {Number.isInteger(item.medications_count) && item.medications_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                          <Pill size={11} className="text-teal-600" />
                          <span>{item.medications_count} meds</span>
                        </span>
                      )}
                    </div>

                    {/* Integrated Audio Player Preview */}
                    {itemAudioUrl && (
                      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-2 text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => togglePlayAudio(item)}
                            aria-label={isCurrentAudio && isPlaying ? 'Pause audio' : 'Play audio note'}
                            className={`flex h-8 w-8 items-center justify-center rounded-full transition shadow-2xs ${
                              isCurrentAudio && isPlaying
                                ? 'bg-teal-600 text-white'
                                : 'bg-white text-teal-700 border border-slate-200 hover:bg-teal-50'
                            }`}
                          >
                            {isCurrentAudio && audioBuffering ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : isCurrentAudio && isPlaying ? (
                              <Pause size={13} />
                            ) : (
                              <Play size={13} className="ml-0.5" />
                            )}
                          </button>
                          <div>
                            <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                              <Volume2 size={12} className="text-teal-600" /> Hindi Voice Note
                            </span>
                            <span className="text-[10px] font-mono tabular-nums text-slate-500">
                              {isCurrentAudio
                                ? `${formatTime(currentTime)} / ${formatTime(duration)}`
                                : '16kHz regional TTS'}
                            </span>
                          </div>
                        </div>

                        <a
                          href={itemAudioUrl}
                          download={`rx_audio_${item.id}.mp3`}
                          className="text-slate-400 hover:text-slate-700 p-1.5"
                          title="Download audio"
                        >
                          <Download size={14} />
                        </a>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center gap-2 pt-1">
                      {/* WhatsApp Direct Link */}
                      <a
                        href={waShareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#1ebe5d] transition"
                      >
                        <WhatsAppIcon className="h-4 w-4 fill-white" />
                        <span>Send WhatsApp</span>
                      </a>

                      {/* PDF Viewer */}
                      {itemPdfUrl && (
                        <a
                          href={itemPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-teal-300 hover:text-teal-700 transition"
                        >
                          <FileText size={14} className="text-teal-600" />
                          <span>PDF</span>
                        </a>
                      )}

                      {/* Native Share fallback */}
                      {canNativeShare && (
                        <button
                          onClick={() => handleNativeShare(item)}
                          className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-2xs transition"
                          title="Share"
                        >
                          <Share2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
