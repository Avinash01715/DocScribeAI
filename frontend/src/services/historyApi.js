/**
 * historyApi.js - Client persistence adapter and URL resolver for consultation records
 */
import { getLanguageMeta } from '../utils/languages'

// Resolves base API endpoint across development, Docker, Railway, and Render
export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '')
  }
  // If Vite dev server is on port 5173, point to default FastAPI port 8000
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://127.0.0.1:8000'
  }
  return typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000'
}

/**
 * Dynamically prefixes relative asset paths (/static/...) with the active API base URL.
 * Fully qualified URLs (https://...) are preserved as-is.
 */
export function resolveAssetUrl(url) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed

  const base = getApiBaseUrl()
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return `${base}${path}`
}

/**
 * Sanitizes phone numbers strictly to E.164 digits without punctuation.
 * Prepend standard Indian country code 91 if a 10-digit mobile number is passed.
 */
export function sanitizePhoneE164(raw) {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return digits
}

/**
 * Builds standard universal wa.me deep-link with pre-encoded prescription summary.
 */
export function buildWhatsAppShareUrl(record) {
  if (!record) return ''
  const phone = sanitizePhoneE164(record.patient_phone || record.phone_number || '')
  const patientName = record.patient_name || 'Patient'
  const diagnosis = record.diagnosis || 'Clinical OPD Assessment'
  const pdfFullUrl = resolveAssetUrl(record.pdf_url)
  const audioFullUrl = resolveAssetUrl(record.audio_url)
  const { label: languageLabel } = getLanguageMeta(record.language)

  const lines = [
    `🩺 *DHANVANTARI CLINIC PRESCRIPTION*`,
    `Patient: *${patientName}*`,
    `Diagnosis: *${diagnosis}*`,
    ``,
    `📄 *Digital Prescription PDF:*`,
    pdfFullUrl || 'Available on request',
  ]

  if (audioFullUrl) {
    lines.push(``, `🔊 Voice Instructions (${languageLabel}): ${audioFullUrl}`)
  }

  lines.push(``, `✅ *Dawai samay par lein. Shubhkaamnayein!*`)

  const text = encodeURIComponent(lines.join('\n'))
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`
}

/**
 * Builds plain-text share content for the Web Share API.
 */
export function buildSharePayload(record) {
  const patientName = record.patient_name || 'Patient'
  const diagnosis = record.diagnosis || 'OPD Assessment'
  const pdfFullUrl = resolveAssetUrl(record.pdf_url)
  const audioFullUrl = resolveAssetUrl(record.audio_url)
  const { label: languageLabel } = getLanguageMeta(record.language)

  const textLines = [
    `Dhanvantari Prescription for ${patientName}`,
    `Diagnosis: ${diagnosis}`,
    pdfFullUrl ? `Prescription PDF: ${pdfFullUrl}` : null,
    audioFullUrl ? `🔊 Voice Instructions (${languageLabel}): ${audioFullUrl}` : null,
  ].filter(Boolean)

  return {
    title: `Prescription - ${patientName}`,
    text: textLines.join('\n'),
    url: pdfFullUrl || window.location.href,
  }
}

/**
 * Fetches recent prescription history records from backend SQLite repository.
 */
export async function fetchPrescriptionHistory(limit = 20) {
  const base = getApiBaseUrl()
  const endpoint = `${base}/api/v1/history?limit=${encodeURIComponent(limit)}`

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    // Graceful fallback to legacy /recent endpoint if needed
    if (response.status === 404) {
      const fallbackRes = await fetch(`${base}/api/v1/history/recent`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      if (fallbackRes.ok) {
        return await fallbackRes.json()
      }
    }
    const errText = await response.text()
    throw new Error(`Failed to load prescription history: ${errText || response.statusText}`)
  }

  const data = await response.json()
  return Array.isArray(data) ? data : []
}

