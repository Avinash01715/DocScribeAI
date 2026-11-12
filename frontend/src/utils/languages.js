/**
 * languages.js - Shared multilingual voice note metadata and normalization helpers
 */

export const LANGUAGE_OPTIONS = [
  { code: 'hi', badge: 'HI', flag: '🇮🇳', nativeLabel: 'हिन्दी', label: 'Hindi' },
  { code: 'en', badge: 'EN', flag: '🇬🇧', nativeLabel: 'English', label: 'English' },
  { code: 'ta', badge: 'TA', flag: '🇮🇳', nativeLabel: 'தமிழ்', label: 'Tamil' },
  { code: 'te', badge: 'TE', flag: '🇮🇳', nativeLabel: 'తెలుగు', label: 'Telugu' },
  { code: 'bn', badge: 'BN', flag: '🇮🇳', nativeLabel: 'বাংলা', label: 'Bengali' },
]

/**
 * Normalizes ISO 639-1 / BCP-47 language inputs ('hi', 'ta-IN', null) to supported 2-letter code.
 * Defaults cleanly to 'hi'.
 */
export function normalizeLanguageCode(lang) {
  if (!lang || typeof lang !== 'string') return 'hi'
  const prefix = lang.trim().toLowerCase().replace('_', '-').split('-')[0]
  return LANGUAGE_OPTIONS.some((opt) => opt.code === prefix) ? prefix : 'hi'
}

/**
 * Resolves full language metadata (code, badge, flag, nativeLabel, label) with 'hi' fallback.
 */
export function getLanguageMeta(lang) {
  const code = normalizeLanguageCode(lang)
  return LANGUAGE_OPTIONS.find((opt) => opt.code === code) || LANGUAGE_OPTIONS[0]
}

