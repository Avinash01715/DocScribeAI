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

// Attach unique client-side identifiers (uid) to each medication for React list keys
export const withUids = (data) => ({
  ...data,
  prescription: (data.prescription || []).map((m, i) => ({ ...m, uid: `m${Date.now()}_${i}` })),
})
