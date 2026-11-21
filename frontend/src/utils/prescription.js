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

// Master safe daily dose ceilings in mg for common active generic salts
export const MAX_DAILY_DOSES = {
  paracetamol: 4000,
  ibuprofen: 2400,
  amoxicillin: 3000,
  cetirizine: 20,
  pantoprazole: 80,
  metformin: 2550,
  aspirin: 4000,
  ciprofloxacin: 1500,
  azithromycin: 500,
  ondansetron: 16,
  telmisartan: 80,
  spironolactone: 100,
  aceclofenac: 200,
  diclofenac: 150,
}

// Canonical generic drug map for client-side pharmacovigilance
export const GENERIC_DRUG_MAP = {
  warfarin: { salt: 'warfarin', classes: ['anticoagulant', 'vitamin_k_antagonist'], default_mg: 5 },
  ibuprofen: { salt: 'ibuprofen', classes: ['nsaid', 'analgesic', 'antipyretic'], default_mg: 400 },
  combiflam: {
    ingredients: [
      { salt: 'ibuprofen', strength_mg: 400 },
      { salt: 'paracetamol', strength_mg: 325 },
    ],
    classes: ['nsaid', 'analgesic', 'antipyretic'],
  },
  aspirin: { salt: 'aspirin', classes: ['nsaid', 'antiplatelet'], default_mg: 75 },
  ecosprin: { salt: 'aspirin', classes: ['nsaid', 'antiplatelet'], default_mg: 75 },
  dolo: { salt: 'paracetamol', classes: ['analgesic', 'antipyretic'], default_mg: 650 },
  calpol: { salt: 'paracetamol', classes: ['analgesic', 'antipyretic'], default_mg: 650 },
  crocin: { salt: 'paracetamol', classes: ['analgesic', 'antipyretic'], default_mg: 650 },
  paracetamol: { salt: 'paracetamol', classes: ['analgesic', 'antipyretic'], default_mg: 650 },
  amoxicillin: { salt: 'amoxicillin', classes: ['penicillin', 'beta_lactam_antibiotic'], default_mg: 500 },
  augmentin: {
    ingredients: [
      { salt: 'amoxicillin', strength_mg: 500 },
      { salt: 'clavulanic_acid', strength_mg: 125 },
    ],
    classes: ['penicillin', 'beta_lactam_antibiotic'],
  },
  azithromycin: { salt: 'azithromycin', classes: ['macrolide_antibiotic', 'qt_prolonging'], default_mg: 500 },
  azithral: { salt: 'azithromycin', classes: ['macrolide_antibiotic', 'qt_prolonging'], default_mg: 500 },
  ondansetron: { salt: 'ondansetron', classes: ['antiemetic', 'qt_prolonging'], default_mg: 4 },
  vomikind: { salt: 'ondansetron', classes: ['antiemetic', 'qt_prolonging'], default_mg: 4 },
  emset: { salt: 'ondansetron', classes: ['antiemetic', 'qt_prolonging'], default_mg: 4 },
  telmisartan: { salt: 'telmisartan', classes: ['arb', 'antihypertensive'], default_mg: 40 },
  telma: { salt: 'telmisartan', classes: ['arb', 'antihypertensive'], default_mg: 40 },
  spironolactone: { salt: 'spironolactone', classes: ['potassium_sparing_diuretic', 'diuretic'], default_mg: 25 },
  aldactone: { salt: 'spironolactone', classes: ['potassium_sparing_diuretic', 'diuretic'], default_mg: 25 },
  ciprofloxacin: { salt: 'ciprofloxacin', classes: ['fluoroquinolone'], default_mg: 500 },
  ciplox: { salt: 'ciprofloxacin', classes: ['fluoroquinolone'], default_mg: 500 },
  digene: { salt: 'antacid', classes: ['antacid'], default_mg: 500 },
  gelusil: { salt: 'antacid', classes: ['antacid'], default_mg: 500 },
  antacid: { salt: 'antacid', classes: ['antacid'], default_mg: 500 },
  pantoprazole: { salt: 'pantoprazole', classes: ['ppi'], default_mg: 40 },
  pan: { salt: 'pantoprazole', classes: ['ppi'], default_mg: 40 },
  metformin: { salt: 'metformin', classes: ['biguanide', 'antidiabetic'], default_mg: 500 },
  aceclofenac: { salt: 'aceclofenac', classes: ['nsaid', 'analgesic'], default_mg: 100 },
  zerodol: { salt: 'aceclofenac', classes: ['nsaid', 'analgesic'], default_mg: 100 },
  diclofenac: { salt: 'diclofenac', classes: ['nsaid', 'analgesic'], default_mg: 50 },
  voveran: { salt: 'diclofenac', classes: ['nsaid', 'analgesic'], default_mg: 50 },
}

// Parse daily dosing count e.g. "1 - 1 - 1" -> 3
export function parseDailyCount(frequency) {
  if (!frequency) return 1
  const freq = String(frequency).toLowerCase()
  const numbers = freq.match(/\b\d+\b/g)
  if (numbers && numbers.length >= 2) {
    return numbers.reduce((sum, n) => sum + parseInt(n, 10), 0)
  }
  if (freq.includes('teen') || freq.includes('thrice') || freq.includes('tid') || freq.includes('tds')) return 3
  if (freq.includes('twice') || freq.includes('subah') || freq.includes('bd') || freq.includes('bid')) return 2
  if (freq.includes('four') || freq.includes('qid')) return 4
  if (numbers && numbers.length === 1) return parseInt(numbers[0], 10) || 1
  return 1
}

// Resolve medication text into active generic salts and pharmacological classes
export function resolveDrugDetails(drugName, dosage) {
  const text = `${drugName || ''} ${dosage || ''}`.toLowerCase()
  const activeIngredients = []
  const drugClasses = new Set()

  const strengthMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:mg|g|mcg|ml)?\b/i)
  const parsedMg = strengthMatch ? parseFloat(strengthMatch[1]) : null

  for (const [key, info] of Object.entries(GENERIC_DRUG_MAP)) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(text)) {
      (info.classes || []).forEach((c) => drugClasses.add(c))
      if (info.ingredients) {
        info.ingredients.forEach((ing) => activeIngredients.push(ing))
      } else if (info.salt) {
        activeIngredients.push({
          salt: info.salt,
          strength_mg: parsedMg || info.default_mg || 500,
        })
      }
    }
  }

  return {
    ingredients: activeIngredients,
    classes: Array.from(drugClasses),
  }
}

// Comprehensive client-side clinical safety evaluator
export function evaluateClinicalSafety(medications = [], allergies = []) {
  if (!Array.isArray(medications)) return []

  const normAllergies = (allergies || []).map((a) => String(a).toLowerCase().trim())
  const resolved = medications.map((med, idx) => {
    const details = resolveDrugDetails(med.drug_name || med.verified_match, med.dosage)
    const mult = parseDailyCount(med.frequency)
    return {
      index: idx,
      med,
      drugName: med.drug_name || med.verified_match || 'Unnamed medicine',
      ingredients: details.ingredients,
      classes: details.classes,
      multiplier: mult,
      clinicalAlerts: [],
      interactionAlerts: [],
    }
  })

  // 1. DUPLICATE SALTS & CUMULATIVE DAILY DOSE OVERDOSE
  const saltBuckets = {}
  resolved.forEach((r) => {
    r.ingredients.forEach((ing) => {
      const s = ing.salt
      if (!saltBuckets[s]) saltBuckets[s] = []
      saltBuckets[s].push({ r, strength_mg: ing.strength_mg })
    })
  })

  Object.entries(saltBuckets).forEach(([salt, entries]) => {
    const involved = Array.from(new Set(entries.map((e) => e.r.drugName)))

    // A. Duplicate salt alert
    if (entries.length > 1) {
      const title = `Therapeutic Duplication: ${salt.toUpperCase()}`
      const desc = `Multiple prescribed medications (${involved.join(', ')}) contain active ${salt}.`
      const alert = {
        alert_type: 'DUPLICATE_SALT',
        severity: 'MAJOR',
        title,
        description: desc,
        involved_drugs: involved,
        can_override: true,
      }
      entries.forEach((e) => {
        e.r.clinicalAlerts.push(alert)
        e.r.interactionAlerts.push(`[MAJOR] ${title}: ${desc}`)
      })
    }

    // B. Cumulative dose overdose alert
    const totalDailyMg = entries.reduce((sum, e) => sum + e.strength_mg * e.r.multiplier, 0)
    const limit = MAX_DAILY_DOSES[salt]
    if (limit && totalDailyMg > limit) {
      const title = `Cumulative Overdose Warning: ${salt.toUpperCase()}`
      const desc = `Cumulative intake of ${salt} is ${totalDailyMg}mg/day, exceeding safe ceiling of ${limit}mg/day across (${involved.join(', ')}).`
      const alert = {
        alert_type: 'CUMULATIVE_OVERDOSE',
        severity: 'CRITICAL',
        title,
        description: desc,
        involved_drugs: involved,
        can_override: true,
      }
      entries.forEach((e) => {
        e.r.clinicalAlerts.push(alert)
        e.r.interactionAlerts.push(`[CRITICAL] ${title}: ${desc}`)
      })
    }
  })

  // 2. PAIRWISE DRUG-DRUG INTERACTIONS (DDIs)
  const n = resolved.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r1 = resolved[i]
      const r2 = resolved[j]
      const d1 = r1.drugName
      const d2 = r2.drugName
      const c1 = r1.classes
      const c2 = r2.classes
      const s1 = r1.ingredients.map((ing) => ing.salt)
      const s2 = r2.ingredients.map((ing) => ing.salt)

      const pairAlerts = []

      // Anticoagulant + NSAID (CRITICAL)
      if (
        (c1.includes('anticoagulant') && c2.includes('nsaid')) ||
        (c2.includes('anticoagulant') && c1.includes('nsaid'))
      ) {
        pairAlerts.push({
          alert_type: 'DDI',
          severity: 'CRITICAL',
          title: 'Critical DDI: Anticoagulant + NSAID',
          description: `Major bleeding hazard: Co-administration of anticoagulant and NSAID (${d1} + ${d2}) significantly increases hemorrhage risk.`,
          involved_drugs: [d1, d2],
          can_override: true,
        })
      }

      // Dual NSAID (MAJOR)
      if (c1.includes('nsaid') && c2.includes('nsaid') && s1.join() !== s2.join()) {
        pairAlerts.push({
          alert_type: 'DDI',
          severity: 'MAJOR',
          title: 'Major DDI: Dual NSAID Therapy',
          description: `Additive GI toxicity: Dual NSAID therapy (${d1} + ${d2}) multiplies ulceration and renal toxicity risk.`,
          involved_drugs: [d1, d2],
          can_override: true,
        })
      }

      // Additive QT Prolongation (MAJOR)
      if (c1.includes('qt_prolonging') && c2.includes('qt_prolonging') && s1.join() !== s2.join()) {
        pairAlerts.push({
          alert_type: 'DDI',
          severity: 'MAJOR',
          title: 'Major DDI: QT Prolongation Risk',
          description: `Cardiac risk: Co-administration of ${d1} and ${d2} carries additive QT-interval prolongation risk.`,
          involved_drugs: [d1, d2],
          can_override: true,
        })
      }

      // ACE-I / ARB + Potassium Sparing Diuretic (MAJOR)
      if (
        ((c1.includes('arb') || c1.includes('ace_inhibitor')) && c2.includes('potassium_sparing_diuretic')) ||
        ((c2.includes('arb') || c2.includes('ace_inhibitor')) && c1.includes('potassium_sparing_diuretic'))
      ) {
        pairAlerts.push({
          alert_type: 'DDI',
          severity: 'MAJOR',
          title: 'Major DDI: Hyperkalemia Risk',
          description: `Electrolyte hazard: Combining ${d1} and ${d2} significantly elevates risk of severe hyperkalemia.`,
          involved_drugs: [d1, d2],
          can_override: true,
        })
      }

      // Fluoroquinolone + Antacid (MODERATE)
      if (
        (c1.includes('fluoroquinolone') && c2.includes('antacid')) ||
        (c2.includes('fluoroquinolone') && c1.includes('antacid'))
      ) {
        pairAlerts.push({
          alert_type: 'DDI',
          severity: 'MODERATE',
          title: 'Moderate DDI: Chelation Hazard',
          description: `Reduced bioavailability: Antacid reduces ${d1} + ${d2} absorption. Separate intake by at least 2 hours.`,
          involved_drugs: [d1, d2],
          can_override: true,
        })
      }

      pairAlerts.forEach((pa) => {
        r1.clinicalAlerts.push(pa)
        r1.interactionAlerts.push(`[${pa.severity}] ${pa.title}: ${pa.description}`)
        r2.clinicalAlerts.push(pa)
        r2.interactionAlerts.push(`[${pa.severity}] ${pa.title}: ${pa.description}`)
      })
    }
  }

  // 3. ALLERGY CROSS-REACTIVITY
  if (normAllergies.length > 0) {
    resolved.forEach((r) => {
      normAllergies.forEach((allergy) => {
        if (
          (allergy.includes('penicillin') || allergy.includes('amoxicillin')) &&
          (r.classes.includes('penicillin') || r.ingredients.some((ing) => ing.salt.includes('amoxicillin')))
        ) {
          const alert = {
            alert_type: 'ALLERGY',
            severity: 'CRITICAL',
            title: 'Critical Allergy Contraindication: Penicillin',
            description: `Contraindicated: Patient has documented Penicillin allergy (cross-reactivity with ${r.drugName}).`,
            involved_drugs: [r.drugName],
            can_override: true,
          }
          r.clinicalAlerts.push(alert)
          r.interactionAlerts.push(`[CRITICAL] ${alert.title}: ${alert.description}`)
        }
      })
    })
  }

  // 4. MAP BACK TO MEDICATION ITEMS
  return resolved.map((r) => {
    const med = r.med
    const cAlerts = r.clinicalAlerts
    const iAlerts = Array.from(new Set(r.interactionAlerts))
    const isOverridden = Boolean(med.override_acknowledged)

    const hasOverdose = cAlerts.some((a) => a.alert_type === 'CUMULATIVE_OVERDOSE')
    let safetyStatus = 'Verified Safe'
    if (hasOverdose) {
      safetyStatus = 'OVERDOSE_WARNING'
    } else if (cAlerts.length > 0) {
      safetyStatus = 'DDI_ALERT'
    }

    const requiresReview = cAlerts.length > 0 && !isOverridden ? true : Boolean(med.requires_review)

    return {
      ...med,
      safety_status: safetyStatus,
      interaction_alerts: iAlerts,
      clinical_alerts: cAlerts,
      requires_review: requiresReview,
      override_acknowledged: isOverridden,
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
    prescription: evaluateClinicalSafety(rawList, data.patient_info?.allergies),
  }
}
