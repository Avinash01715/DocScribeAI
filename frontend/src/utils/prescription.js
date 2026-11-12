// Form field definitions and validation requirements for each medication item
export const MED_FIELDS = [
  { key: 'drug_name', label: 'Medicine', required: true, span: 'sm:col-span-2' },
  { key: 'dosage', label: 'Dosage', required: true },
  { key: 'frequency', label: 'Frequency (1 - 1 - 1)', required: true },
  { key: 'timing', label: 'Timing', required: false },
  { key: 'duration', label: 'Duration', required: true },
]

// Identify any required medication fields that are empty or missing
export const missingFields = (med) =>
  MED_FIELDS.filter((f) => f.required && !String(med[f.key] || '').trim()).map((f) => f.label)

// Master safe ceilings in mg for common medications
export const MAX_DAILY_DOSES = {
  paracetamol: 4000,
  dolo: 4000,
  ibuprofen: 2400,
  amoxicillin: 3000,
  cetirizine: 20,
  pantoprazole: 80,
  metformin: 2550,
  aspirin: 4000,
  ciprofloxacin: 1500,
}

// Known pairwise Drug-Drug Interaction (DDI) rules
export const DDI_INTERACTION_RULES = [
  {
    pair: ['aspirin', 'ibuprofen'],
    warning: 'Severe risk of gastrointestinal ulceration/bleeding.',
  },
  {
    pair: ['ciprofloxacin', 'antacid'],
    warning: 'Chelation hazard: Antacid reduces antibiotic absorption.',
  },
  {
    pair: ['paracetamol', 'alcohol'],
    warning: 'Hepatotoxicity alert.',
  },
]

// Calculate cumulative daily dose in mg
export function calculateDailyDose(drugName, dosage, frequency) {
  const text = `${dosage || ''} ${drugName || ''}`
  const match = text.match(/(\d+)\s*mg/i)
  if (!match) return null
  const unitMg = parseInt(match[1], 10)

  // Parse frequency count e.g. "1 - 1 - 1" -> 3
  const numbers = String(frequency || '').match(/\b\d+\b/g)
  const count = numbers ? numbers.reduce((sum, n) => sum + parseInt(n, 10), 0) : 1
  return unitMg * count
}

// Client-side clinical safety and DDI evaluator
export function evaluateClinicalSafety(medications = []) {
  if (!Array.isArray(medications)) return []
  const ddiAlerts = medications.map(() => [])

  // Check pairwise DDI interactions
  for (let i = 0; i < medications.length; i++) {
    for (let j = i + 1; j < medications.length; j++) {
      const d1 = (medications[i]?.drug_name || medications[i]?.verified_match || '').toLowerCase()
      const d2 = (medications[j]?.drug_name || medications[j]?.verified_match || '').toLowerCase()

      for (const rule of DDI_INTERACTION_RULES) {
        const [k1, k2] = rule.pair
        if ((d1.includes(k1) && d2.includes(k2)) || (d2.includes(k1) && d1.includes(k2))) {
          const med2Name = medications[j]?.drug_name || 'other drug'
          const med1Name = medications[i]?.drug_name || 'other drug'
          ddiAlerts[i].push(`DDI Alert: Contraindicated with ${med2Name} (${rule.warning})`)
          ddiAlerts[j].push(`DDI Alert: Contraindicated with ${med1Name} (${rule.warning})`)
        }
      }
    }
  }

  // Check dose ceilings and compile alerts
  return medications.map((med, idx) => {
    const alertSet = new Set(ddiAlerts[idx])
    
    const dailyMg = calculateDailyDose(med.drug_name, med.dosage, med.frequency)
    let safetyStatus = 'Verified Safe'

    if (dailyMg !== null) {
      const nameLower = (med.drug_name || '').toLowerCase()
      for (const [key, limit] of Object.entries(MAX_DAILY_DOSES)) {
        if (nameLower.includes(key)) {
          if (dailyMg > limit) {
            safetyStatus = 'OVERDOSE_WARNING'
            alertSet.add(`OVERDOSE_WARNING: ${med.drug_name} intake of ${dailyMg}mg/day exceeds safe ceiling of ${limit}mg/day.`)
          }
          break
        }
      }
    }

    const finalAlerts = Array.from(alertSet)
    if (finalAlerts.length > 0 && safetyStatus !== 'OVERDOSE_WARNING') {
      safetyStatus = 'DDI_ALERT'
    }

    return {
      ...med,
      safety_status: safetyStatus,
      interaction_alerts: finalAlerts,
      requires_review: finalAlerts.length > 0 ? true : Boolean(med.requires_review),
    }
  })
}

// Attach unique client-side identifiers (uid) to each medication and evaluate safety
export const withUids = (data) => {
  if (!data) return data
  const rawList = (data.prescription || []).map((m, i) => ({
    ...m,
    uid: m.uid || `m${Date.now()}_${i}`,
  }))
  return {
    ...data,
    prescription: evaluateClinicalSafety(rawList),
  }
}
