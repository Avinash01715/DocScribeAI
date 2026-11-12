import { AlertTriangle, CheckCircle2, Pill, ShieldCheck, Trash2 } from 'lucide-react'
import { MED_FIELDS, missingFields } from '../../utils/prescription'

/**
 * MedicineCard.jsx - Structured Prescription Item (Minimalist Light Clinical)
 */

// Parse matrix frequency string (e.g. 1 - 1 - 1) into Morning, Noon, and Night dosage slots
function parseFrequencySlots(freqStr) {
  if (!freqStr) return null
  const parts = String(freqStr).replace(/\s/g, '').split(/[-/]/)
  if (parts.length === 3) {
    return [
      { label: 'Morning', value: parts[0], active: parts[0] !== '0' },
      { label: 'Noon', value: parts[1], active: parts[1] !== '0' },
      { label: 'Night', value: parts[2], active: parts[2] !== '0' },
    ]
  }
  return null
}

// Generate review reason message if medicine match confidence is below threshold
function reviewReason(med) {
  if (!med.requires_review && (med.confidence_score ?? 100) >= 75) return null
  const match = med.verified_match
    ? `Match: "${med.verified_match}" (${Math.round(med.confidence_score || 0)}%). `
    : 'Unconfirmed match. '
  return `${match}Please verify.`
}

// Individual editable medicine card component with fuzzy formulary validation feedback
export default function MedicineCard({ med, onChange, onRemove }) {
  const missing = missingFields(med)
  const reason = reviewReason(med)
  const hasAlerts = Array.isArray(med.interaction_alerts) && med.interaction_alerts.length > 0
  const isHighConfidence =
    !med.requires_review && (med.confidence_score ?? 100) >= 75 && !hasAlerts
  const isReviewRequired =
    med.requires_review || (med.confidence_score ?? 100) < 75 || hasAlerts

  const freqSlots = parseFrequencySlots(med.frequency)

  return (
    <div
      className={`rounded-2xl border p-3.5 transition-colors ${
        hasAlerts
          ? 'border-rose-300 bg-rose-50/40'
          : isReviewRequired
          ? 'border-amber-300 bg-amber-50/40'
          : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
      }`}
    >
      {/* Header with medicine label and verification status badge */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="flex items-center gap-1.5">
          <Pill size={15} className="text-teal-600" />
          <span className="text-xs sm:text-sm font-bold text-slate-900">
            {med.drug_name || 'New Medicine'}
          </span>
        </div>

        {/* Verification status badges */}
        <div className="flex items-center gap-1.5">
          {hasAlerts && (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100/90 px-2 py-0.5 text-[11px] font-bold text-rose-900">
              <AlertTriangle size={12} className="text-rose-600" />
              Safety Alert
            </span>
          )}

          {isHighConfidence && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
              <CheckCircle2 size={12} className="text-emerald-600" />
              Verified ({Math.round(med.confidence_score || 100)}%)
            </span>
          )}

          {!hasAlerts && isReviewRequired && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100/70 px-2 py-0.5 text-[11px] font-bold text-amber-900">
              <AlertTriangle size={12} className="text-amber-700" />
              Review ({Math.round(med.confidence_score || 0)}%)
            </span>
          )}
        </div>
      </div>

      {/* Prominent Clinical Safety and DDI Warning Badge */}
      {hasAlerts && (
        <div className="mb-2.5 space-y-1.5">
          {med.interaction_alerts.map((alert, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-100/80 px-2.5 py-1.5 text-xs font-bold text-rose-900"
            >
              <span className="shrink-0 text-xs">🔴</span>
              <span>{alert}</span>
            </div>
          ))}
        </div>
      )}

      {/* Editable input fields for dosage, frequency, timing, and duration */}
      <div className="grid gap-2 sm:grid-cols-2">
        {MED_FIELDS.map((f) => {
          const empty = f.required && !String(med[f.key] || '').trim()
          return (
            <label key={f.key} className={`block ${f.span || ''}`}>
              <span className="mb-0.5 block text-[11px] font-bold text-slate-700">
                {f.label}
              </span>
              <input
                value={med[f.key] || ''}
                onChange={(e) => onChange(med.uid, f.key, e.target.value)}
                placeholder={empty ? 'Required' : ''}
                className={`w-full rounded-xl border bg-slate-50/70 px-2.5 py-1.5 text-xs font-semibold text-slate-900 outline-none transition placeholder:text-amber-700 focus:border-teal-600 focus:bg-white ${
                  empty ? 'border-amber-400 bg-amber-50/30' : 'border-slate-300'
                }`}
              />
            </label>
          )
        })}
      </div>

      {/* Visual representation of morning, noon, and night medication doses */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-700">Schedule:</span>
          {freqSlots ? (
            <div className="flex items-center gap-1 font-mono text-[11px]">
              {freqSlots.map((slot, i) => (
                <span
                  key={i}
                  className={`rounded-md px-1.5 py-0.5 font-bold ${
                    slot.active
                      ? 'bg-teal-100 text-teal-900 border border-teal-300'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {slot.label}: {slot.value}
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-slate-800 font-bold">
              {med.frequency || 'Custom'}
            </span>
          )}
        </div>

        <span className="text-[11px] font-medium text-slate-700">
          <strong className="font-bold text-slate-900">{med.timing || 'After meals'}</strong> • <strong className="font-bold text-slate-900">{med.duration || '3 days'}</strong>
        </span>
      </div>

      {/* Review warning banner with quick-confirmation button */}
      {reason && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs font-medium text-amber-900">
          <div className="flex items-center gap-1.5 font-semibold text-[11px]">
            <AlertTriangle size={13} className="shrink-0 text-amber-700" />
            <span>{reason}</span>
          </div>
          <button
            onClick={() => {
              onChange(med.uid, 'requires_review', false)
              onChange(med.uid, 'confidence_score', 100)
            }}
            className="flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100 shadow-2xs"
          >
            <ShieldCheck size={12} className="text-amber-700" /> Confirm
          </button>
        </div>
      )}

      {/* Warning for unpopulated required fields */}
      {missing.length > 0 && (
        <p className="mt-1 text-[11px] font-bold text-amber-800">
          Missing: {missing.join(', ')}
        </p>
      )}

      {/* Button to remove this medication item */}
      <div className="mt-2 flex justify-end">
        <button
          onClick={() => onRemove(med.uid)}
          className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-600 transition"
          aria-label={`${med.drug_name || 'Medicine'} remove`}
        >
          <Trash2 size={12} /> Remove
        </button>
      </div>
    </div>
  )
}
