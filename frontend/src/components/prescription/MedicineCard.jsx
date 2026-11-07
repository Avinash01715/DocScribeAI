import { AlertTriangle, CheckCircle2, Pill, ShieldCheck, Trash2 } from 'lucide-react'
import { MED_FIELDS, missingFields } from '../../utils/prescription'

/**
 * MedicineCard.jsx - Structured Prescription Grid & Human-in-the-Loop Editor
 *
 * Implements specifications:
 * 1. Form inputs for canonical drug name with strength, dosage format/unit, frequency, timing, duration.
 * 2. Standardized Frequency Visualizer:
 *    - Parses OPD notation (e.g. "1 - 1 - 1" or "1 - 0 - 1") and renders morning/afternoon/night indicator pills.
 * 3. Safety & Verification Badges:
 *    - Green checkmark badge (emerald-400) for high-confidence formulary matches (confidence >= 75%).
 *    - Amber warning badge (amber-400) when confidence drops below 75% or requires_review is true.
 * 4. Human-in-the-loop interaction allowing clinicians to edit, confirm fuzzy matches, or delete rows.
 */

// Helper to parse OPD frequency (e.g. "1 - 1 - 1") into visual time-of-day slots
function parseFrequencySlots(freqStr) {
  if (!freqStr) return null
  const parts = String(freqStr).replace(/\s/g, '').split(/[-/]/)
  if (parts.length === 3) {
    return [
      { label: 'Morn', value: parts[0], active: parts[0] !== '0' },
      { label: 'Noon', value: parts[1], active: parts[1] !== '0' },
      { label: 'Night', value: parts[2], active: parts[2] !== '0' },
    ]
  }
  return null
}

function reviewReason(med) {
  if (!med.requires_review && (med.confidence_score ?? 100) >= 75) return null
  const match = med.verified_match
    ? `Catalog match: "${med.verified_match}" (${Math.round(med.confidence_score || 0)}%). `
    : 'Formulary match nahi mila. '
  return `${match}Naam ya dosage check karein.`
}

export default function MedicineCard({ med, onChange, onRemove }) {
  const missing = missingFields(med)
  const reason = reviewReason(med)
  const isHighConfidence =
    !med.requires_review && (med.confidence_score ?? 100) >= 75
  const isReviewRequired =
    med.requires_review || (med.confidence_score ?? 100) < 75

  const freqSlots = parseFrequencySlots(med.frequency)

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        isReviewRequired
          ? 'border-amber-500/50 bg-amber-500/5'
          : 'border-slate-800 bg-ink/50 hover:border-slate-700'
      }`}
    >
      {/* Card Header: Drug Title & Verification Status Badges */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <Pill size={16} className="text-teal-400" />
          <span className="font-semibold text-slate-100">
            {med.drug_name || 'New Medication Entry'}
          </span>
        </div>

        {/* Safety & Verification Badges */}
        <div className="flex items-center gap-2">
          {isHighConfidence && (
            <span
              className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400"
              title="Verified with RapidFuzz against Master Pharmaceutical Catalog"
            >
              <CheckCircle2 size={13} />
              Formulary Verified ({Math.round(med.confidence_score || 100)}%)
            </span>
          )}

          {isReviewRequired && (
            <span
              className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300 animate-pulse"
              title="Confidence score < 75% or unconfirmed formulary match"
            >
              <AlertTriangle size={13} />
              Review Required ({Math.round(med.confidence_score || 0)}%)
            </span>
          )}
        </div>
      </div>

      {/* Editable Field Matrix */}
      <div className="grid gap-3 sm:grid-cols-2">
        {MED_FIELDS.map((f) => {
          const empty = f.required && !String(med[f.key] || '').trim()
          return (
            <label key={f.key} className={`block ${f.span || ''}`}>
              <span className="mb-1 block text-xs font-medium text-slate-400">
                {f.label}
              </span>
              <input
                value={med[f.key] || ''}
                onChange={(e) => onChange(med.uid, f.key, e.target.value)}
                placeholder={empty ? 'Required field' : ''}
                className={`w-full rounded-lg border bg-ink px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-amber-300/70 focus:border-teal-400 ${
                  empty ? 'border-amber-500/70' : 'border-slate-800'
                }`}
              />
            </label>
          )
        })}
      </div>

      {/* Standardized Frequency Visualizer (e.g. 1 - 1 - 1 or 1 - 0 - 1) */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/60 bg-ink/30 p-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">
            Dose Schedule:
          </span>
          {freqSlots ? (
            <div className="flex items-center gap-1.5 font-mono text-xs">
              {freqSlots.map((slot, i) => (
                <span
                  key={i}
                  className={`rounded px-2 py-0.5 font-bold ${
                    slot.active
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {slot.label}: {slot.value}
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-xs text-slate-400">
              {med.frequency || 'Custom timing'}
            </span>
          )}
        </div>

        <span className="text-xs text-slate-400">
          Timing: <strong className="text-slate-200">{med.timing || 'After meals'}</strong> • Duration: <strong className="text-slate-200">{med.duration || '3 days'}</strong>
        </span>
      </div>

      {/* Human-in-the-Loop Review Callout */}
      {reason && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={14} className="shrink-0 text-amber-400" />
            <span>{reason}</span>
          </div>
          <button
            onClick={() => {
              onChange(med.uid, 'requires_review', false)
              onChange(med.uid, 'confidence_score', 100)
            }}
            className="flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/20 px-3 py-1 font-medium text-amber-100 hover:bg-amber-400/30"
          >
            <ShieldCheck size={13} /> Confirm Match
          </button>
        </div>
      )}

      {missing.length > 0 && (
        <p className="mt-2 text-xs text-amber-300">
          Missing fields: {missing.join(', ')}
        </p>
      )}

      {/* Remove Medication Action */}
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => onRemove(med.uid)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 transition"
          aria-label={`${med.drug_name || 'Medicine'} remove`}
        >
          <Trash2 size={14} /> Remove Entry
        </button>
      </div>
    </div>
  )
}
