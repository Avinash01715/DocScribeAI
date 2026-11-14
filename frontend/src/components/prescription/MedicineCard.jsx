import { useState } from 'react'
import { AlertTriangle, AlertCircle, Check, Edit2, Trash2 } from 'lucide-react'
import { MED_FIELDS, missingFields } from '../../utils/prescription'

/**
 * MedicineCard.jsx - Ruled Prescription Line Item
 * Embodies an authentic clinical paper prescription line item (NOT a bulky card).
 */

// Parse matrix frequency string (e.g. 1 - 0 - 1) into Morning, Noon, and Night dosage slots
function parseFrequencySlots(freqStr) {
  if (!freqStr) return null
  const parts = String(freqStr).replace(/\s/g, '').split(/[-/]/)
  if (parts.length === 3) {
    return [
      { label: 'Morning', value: parts[0], active: parts[0] !== '0' },
      { label: 'Noon',    value: parts[1], active: parts[1] !== '0' },
      { label: 'Night',   value: parts[2], active: parts[2] !== '0' },
    ]
  }
  return null
}

function reviewReason(med) {
  if (!med.requires_review && (med.confidence_score ?? 100) >= 75) return null
  if (med.verified_match) {
    return `Formulary match: ${med.verified_match}. Please confirm.`
  }
  return 'Unconfirmed medicine match. Please confirm.'
}

export default function MedicineCard({ med, onChange, onRemove }) {
  const [isEditing, setIsEditing] = useState(false)

  const missing = missingFields(med)
  const reason = reviewReason(med)
  const hasAlerts = Array.isArray(med.interaction_alerts) && med.interaction_alerts.length > 0
  const isReviewRequired = med.requires_review || (med.confidence_score ?? 100) < 75

  const freqSlots = parseFrequencySlots(med.frequency)

  return (
    <div className="py-3 border-b border-[#DCE6DF] animate-line-settle transition-colors">
      {/* Top line: Medicine name, dosage, and quick action icons */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-serif text-base font-semibold text-[#17211B] break-words">
              {med.drug_name || 'Unnamed medicine'}
            </span>
            {med.dosage && (
              <span className="font-serif text-sm text-[#4A5D52] whitespace-nowrap">
                {med.dosage}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons (44px min touch target) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            title={isEditing ? 'Close editor' : 'Edit medicine'}
            aria-label={isEditing ? 'Close editor' : 'Edit medicine'}
            className="btn-icon min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#4A5D52] hover:text-[#17211B] hover:bg-[#F3F7F4]"
          >
            <Edit2 className="w-4 h-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => onRemove(med.uid)}
            title="Remove medicine"
            aria-label="Remove medicine"
            className="btn-icon min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#4A5D52] hover:text-[#B91C1C] hover:bg-[#FEE2E2]"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Second line: 3-slot dosage boxes + Meal timing + Duration */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
        {/* 3-slot dosage visual (Morning / Noon / Night) */}
        <div className="flex items-center gap-1.5 font-mono">
          {freqSlots ? (
            freqSlots.map((slot, i) => (
              <span
                key={i}
                className={`inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded text-[11px] font-medium border ${
                  slot.active
                    ? 'bg-[#14633F] text-white border-[#14633F]'
                    : 'bg-white text-[#4A5D52] border-[#DCE6DF]'
                }`}
                title={`${slot.label}: ${slot.value}`}
              >
                {slot.value}
              </span>
            ))
          ) : (
            <span className="text-[#17211B] font-medium">
              {med.frequency || 'As directed'}
            </span>
          )}
        </div>

        {/* Meal timing */}
        <span className="text-xs text-[#17211B] bg-[#F3F7F4] border border-[#DCE6DF] px-2 py-0.5 rounded">
          {med.timing || 'After meals'}
        </span>

        {/* Duration */}
        <span className="text-xs text-[#4A5D52]">
          {med.duration || '5 days'}
        </span>
      </div>

      {/* Inline editing form fields (16px input font size prevents mobile Safari zoom) */}
      {isEditing && (
        <div className="mt-3 pt-3 border-t border-dashed border-[#DCE6DF] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {MED_FIELDS.map((f) => (
            <label key={f.key} className={`block ${f.span || ''}`}>
              <span className="block text-[11px] font-medium text-[#4A5D52] mb-1">
                {f.label}
              </span>
              <input
                type="text"
                value={med[f.key] || ''}
                onChange={(e) => onChange(med.uid, f.key, e.target.value)}
                className="w-full bg-white border border-[#DCE6DF] rounded-lg px-2.5 py-2 text-base sm:text-xs text-[#17211B] focus:border-[#14633F] outline-none"
              />
            </label>
          ))}
        </div>
      )}

      {/* Inline Safety Warnings (Drug interaction or review needed) */}
      {hasAlerts && (
        <div className="mt-2 space-y-1">
          {med.interaction_alerts.map((alert, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 p-2 rounded bg-[#FEE2E2] border border-[#FECACA] text-[#B91C1C] text-xs font-medium"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              <span>{alert}</span>
            </div>
          ))}
        </div>
      )}

      {!hasAlerts && isReviewRequired && reason && (
        <div className="mt-2 flex items-center justify-between gap-2 p-2 rounded bg-[#FEF3C7] border border-[#FDE68A] text-[#B45309] text-xs">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span>{reason}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(med.uid, 'requires_review', false)
              onChange(med.uid, 'confidence_score', 100)
            }}
            className="btn-secondary min-h-[36px] px-3 py-1 rounded-lg bg-white border border-[#FDE68A] text-[#B45309] font-medium flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Confirm</span>
          </button>
        </div>
      )}

      {missing.length > 0 && (
        <p className="mt-1.5 text-[11px] text-[#B45309]">
          Missing details: {missing.join(', ')}
        </p>
      )}
    </div>
  )
}
