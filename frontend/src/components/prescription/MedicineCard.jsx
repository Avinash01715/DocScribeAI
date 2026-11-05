import { AlertTriangle, Trash2 } from 'lucide-react'
import { MED_FIELDS, missingFields } from '../../utils/prescription'

// Doctor ko dikhane layak review reason (ya null)
function reviewReason(med) {
  if (!med.requires_review) return null
  const match = med.verified_match
    ? `Catalog mein sabse paas: "${med.verified_match}" (${Math.round(med.confidence_score)}% match). `
    : 'Catalog mein match nahi mila. '
  return `${match}Naam check karke sahi karein.`
}

/**
 * Props:
 *  med       -> ek medicine (backend schema) + uid (sirf frontend ki key)
 *  onChange(uid, key, value)
 *  onRemove(uid)
 */
export default function MedicineCard({ med, onChange, onRemove }) {
  const missing = missingFields(med)
  const reason = reviewReason(med)
  const warn = missing.length > 0 || reason

  return (
    <div className={`rounded-xl border p-4 ${warn ? 'border-amber-500/60 bg-amber-500/5' : 'border-slate-700 bg-ink/40'}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        {MED_FIELDS.map((f) => {
          const empty = f.required && !String(med[f.key] || '').trim()
          return (
            <label key={f.key} className={`block ${f.span || ''}`}>
              <span className="mb-1 block text-xs text-slate-400">{f.label}</span>
              <input
                value={med[f.key] || ''}
                onChange={(e) => onChange(med.uid, f.key, e.target.value)}
                placeholder={empty ? 'Bharna zaroori hai' : ''}
                className={`w-full rounded-lg border bg-ink px-3 py-2 text-sm outline-none placeholder:text-amber-300/70 focus:border-brand ${empty ? 'border-amber-500/70' : 'border-slate-700'}`}
              />
            </label>
          )
        })}
      </div>

      {reason && (
        <p className="mt-3 flex gap-2 text-xs text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {reason}
          {/* Naam sahi hai to ek click mein confirm */}
          <button
            onClick={() => onChange(med.uid, 'requires_review', false)}
            className="ml-auto shrink-0 rounded-full border border-amber-400/60 px-3 py-0.5 text-amber-200 hover:bg-amber-500/10"
          >
            Naam sahi hai
          </button>
        </p>
      )}
      {missing.length > 0 && <p className="mt-2 text-xs text-amber-300">Khali: {missing.join(', ')}</p>}

      <div className="mt-3 flex justify-end">
        <button
          onClick={() => onRemove(med.uid)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-300"
          aria-label={`${med.drug_name || 'Medicine'} hatayein`}
        >
          <Trash2 size={14} /> Hatayein
        </button>
      </div>
    </div>
  )
}