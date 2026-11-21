import { useState } from 'react'
import { AlertTriangle, AlertCircle, Check, Edit2, Trash2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { MED_FIELDS, missingFields } from '../../utils/prescription'

/**
 * MedicineCard.jsx - Ruled Prescription Line Item
 * Authentic clinical paper prescription line item with formulary match percentage badges,
 * structured clinical safety alerts (DDI, duplicate salts, overdose, allergy), and clinician override controls.
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
  const score = Math.round(med.confidence_score ?? 100)
  if (!med.requires_review && score >= 80) return null
  if (med.verified_match && med.verified_match !== med.drug_name) {
    return `${score}% match — verify formulary match: ${med.verified_match}`
  }
  return 'Unverified medication — please confirm'
}

export default function MedicineCard({
  med,
  onChange,
  onRemove,
  onConfirm,
  onToggleOverride,
}) {
  const [isEditing, setIsEditing] = useState(false)

  const missing = missingFields(med)
  const reason = reviewReason(med)
  const score = Math.round(med.confidence_score ?? 100)

  // Standardize alerts from structured clinical_alerts or fallback string interaction_alerts
  const clinicalAlerts = Array.isArray(med.clinical_alerts) ? med.clinical_alerts : []
  const alertsToRender = clinicalAlerts.length > 0
    ? clinicalAlerts
    : (Array.isArray(med.interaction_alerts) ? med.interaction_alerts : []).map((alt) => ({
        alert_type: alt.includes('DUPLICATE') ? 'DUPLICATE_SALT' : alt.includes('OVERDOSE') ? 'CUMULATIVE_OVERDOSE' : 'DDI',
        severity: alt.includes('[CRITICAL]') ? 'CRITICAL' : alt.includes('[MODERATE]') ? 'MODERATE' : 'MAJOR',
        title: alt.includes(':') ? alt.split(':')[0].replace(/\[.*?\]\s*/, '').trim() : 'Safety Alert',
        description: alt.includes(':') ? alt.split(':').slice(1).join(':').trim() : alt,
        can_override: true,
      }))
  const hasAlerts = alertsToRender.length > 0

  const isFormularyReviewRequired = Boolean(
    (!med.override_acknowledged && med.requires_review && (!med.verified_match || score < 80)) ||
    (score < 80 && !med.override_acknowledged)
  )

  // Use verified formulary match when verified at >= 80% and not requiring review, otherwise show current drug name
  const displayName = (med.verified_match && score >= 80 && !med.requires_review)
    ? med.verified_match
    : (med.drug_name || 'Unnamed medicine')

  const showHeardSubtitle = Boolean(
    !med.requires_review &&
    med.verified_match &&
    med.drug_name &&
    med.verified_match.trim().toLowerCase() !== med.drug_name.trim().toLowerCase() &&
    score < 95
  )

  const freqSlots = parseFrequencySlots(med.frequency)

  const handleConfirm = (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()

    // Close the active editing section
    setIsEditing(false)

    const currentDrugName = (med.drug_name || '').trim() || 'Unnamed medicine'
    const targetVerified = med.verified_match || currentDrugName

    if (onConfirm) {
      onConfirm(med.uid, {
        drug_name: currentDrugName,
        verified_match: targetVerified,
        confidence_score: 100,
        requires_review: false,
      })
    } else if (onChange) {
      onChange(med.uid, {
        drug_name: currentDrugName,
        verified_match: targetVerified,
        confidence_score: 100,
        requires_review: false,
      })
    }
  }

  return (
    <div className="py-3 border-b border-[#DCE6DF] animate-line-settle transition-colors">
      {/* Top line: Medicine name, dosage, match percentage badge, and quick action icons */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif text-base font-semibold text-[#17211B] break-words">
              {displayName}
            </span>
            {med.dosage && (
              <span className="font-serif text-sm text-[#4A5D52] whitespace-nowrap">
                {med.dosage}
              </span>
            )}

            {/* Match percentage / verification badge */}
            {med.requires_review && !med.override_acknowledged ? (
              !med.verified_match ? (
                /* Custom / manual unverified medicine */
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]"
                  title="Unverified medication — please confirm"
                >
                  <AlertTriangle className="w-3 h-3 text-[#B45309]" strokeWidth={2} />
                  <span>Unverified</span>
                </span>
              ) : (
                /* Formulary fuzzy match requiring confirmation */
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]"
                  title={`${score}% match requires clinical confirmation`}
                >
                  <AlertTriangle className="w-3 h-3 text-[#B91C1C]" strokeWidth={2} />
                  <span>{score}% match</span>
                </span>
              )
            ) : score >= 90 ? (
              /* Clinician-confirmed or high-confidence formulary match */
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F3F7F4] text-[#14633F] border border-[#DCE6DF]"
                title="Clinician verified medication"
              >
                <Check className="w-3 h-3 text-[#14633F]" strokeWidth={2.2} />
                <span>{score === 100 && med.verified_match ? 'Verified' : `${score}% match`}</span>
              </span>
            ) : (
              /* Probable formulary match (80-89%) */
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]"
                title={`${score}% probable formulary match`}
              >
                <Check className="w-3 h-3 text-[#B45309]" strokeWidth={2.2} />
                <span>{score}% match</span>
              </span>
            )}
          </div>

          {/* Sub-label showing what was transcribed when verified match differs and score < 95 */}
          {showHeardSubtitle && (
            <p className="text-[11px] text-[#4A5D52] italic mt-0.5">
              Heard: &ldquo;{med.drug_name}&rdquo;
            </p>
          )}
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

      {/* 1. Clinical Safety Alerts (DDI, Duplicate Salt, Overdose, Allergy) */}
      {hasAlerts && (
        <div className="mt-2 space-y-2">
          {alertsToRender.map((alert, idx) => {
            const isCriticalOrMajor = alert.severity === 'CRITICAL' || alert.severity === 'MAJOR'
            const badgeCls = isCriticalOrMajor
              ? 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]'
              : 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]'

            if (med.override_acknowledged) {
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#F3F7F4] border border-[#DCE6DF] text-xs text-[#4A5D52]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ShieldCheck className="w-4 h-4 text-[#14633F] shrink-0" strokeWidth={1.75} />
                    <span className="font-medium text-[#17211B] truncate">{alert.title}</span>
                    <span className="text-[11px] text-[#14633F] italic shrink-0">(Clinician override acknowledged)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleOverride?.(med.uid, false)}
                    className="min-h-[44px] px-2 text-xs font-semibold text-[#B45309] hover:text-[#17211B] shrink-0 transition-colors"
                  >
                    Undo
                  </button>
                </div>
              )
            }

            return (
              <div
                key={idx}
                className={`p-2.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                  isCriticalOrMajor
                    ? 'bg-[#FEE2E2] border-[#FECACA] text-[#B91C1C]'
                    : 'bg-[#FEF3C7] border-[#FDE68A] text-[#B45309]'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  {isCriticalOrMajor ? (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-xs tracking-tight">
                        {alert.title}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${badgeCls}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#17211B] opacity-90 leading-relaxed">
                      {alert.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleOverride?.(med.uid, true)}
                  className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-white border border-current font-semibold text-xs flex items-center justify-center gap-1.5 shrink-0 self-end sm:self-center shadow-xs hover:bg-[#FFFBEB] transition-colors"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Acknowledge & Override</span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* 2. Formulary Name Verification Banner (Shown when name verification is needed) */}
      {isFormularyReviewRequired && reason && (
        <div className="mt-2 flex items-center justify-between gap-2 p-2 rounded bg-[#FEF3C7] border border-[#FDE68A] text-[#B45309] text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{reason}</span>
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-secondary min-h-[44px] px-3 py-1 rounded-lg bg-white border border-[#FDE68A] text-[#B45309] font-medium flex items-center gap-1.5 shrink-0 hover:bg-[#FFFBEB] transition-colors"
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
